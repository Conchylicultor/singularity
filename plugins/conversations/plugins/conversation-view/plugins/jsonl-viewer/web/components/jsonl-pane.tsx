import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";

import type { Conversation } from "@plugins/conversations/shared";
import { jsonlEventsResource, type JsonlEvent } from "../../shared";
import { formatTokenCount } from "../utils";
import { EventRow } from "./event-row";
import { LastAssistantProvider } from "./last-assistant-context";

interface UsageTotals {
  output: number;
  latestContext: number;
}

function aggregateUsage(events: JsonlEvent[] | null): UsageTotals | null {
  if (!events || events.length === 0) return null;
  let output = 0;
  let latestContext = 0;
  let sawAny = false;
  for (const event of events) {
    if (event.kind !== "assistant-text" && event.kind !== "assistant-tool-use") continue;
    if (!event.usage) continue;
    sawAny = true;
    output += event.usage.output;
    // Latest context (last message that produced output) reflects the most
    // recent prompt size — useful as a "current context window" gauge.
    latestContext =
      event.usage.input + event.usage.cacheRead + event.usage.cacheCreation;
  }
  return sawAny ? { output, latestContext } : null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function WorkingIndicator({ startAt }: { startAt: number }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startAt) / 1000),
  );
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [startAt]);

  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <span className="tabular-nums text-xs text-muted-foreground/60">
        Working for {formatElapsed(elapsed)}
      </span>
    </div>
  );
}

export function JsonlPane({
  conversation,
  actions,
  children,
}: {
  conversation: Conversation;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const isWorking = conversation.status === "working" || conversation.status === "starting";
  const isGone = conversation.status === "gone";
  const { data, error, isLoading } = useResource(jsonlEventsResource, {
    id: conversation.id,
  });
  const events = data ?? null;
  const totals = useMemo(() => aggregateUsage(events), [events]);
  const lastAssistantEvent = useMemo(() => {
    if (!events) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.kind === "assistant-text") return events[i] ?? null;
    }
    return null;
  }, [events]);
  // Derive when "working" started: last event's timestamp, or now if none
  const workingStartAtRef = useRef<number | null>(null);
  const wasWorkingRef = useRef(false);
  if (isWorking) {
    if (!wasWorkingRef.current) {
      // Transition into working: seed from last event or now
      const lastEvent = events?.length ? events[events.length - 1] : null;
      const lastAt = lastEvent?.at ?? null;
      workingStartAtRef.current = lastAt ? new Date(lastAt).getTime() : Date.now();
    }
    wasWorkingRef.current = true;
  } else {
    wasWorkingRef.current = false;
    workingStartAtRef.current = null;
  }
  const workingStartAt = workingStartAtRef.current ?? Date.now();

  const sticky = useStickyScroll({
    resetKey: conversation.id,
    forceScrollKey: isWorking ? 1 : 0,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        {events !== null && (
          <span className="tabular-nums text-xs text-muted-foreground">
            {events.length}
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={sticky.scrollRef}
          className={`h-full overflow-auto transition-opacity ${isGone ? "opacity-50" : ""}`}
        >
          <div ref={sticky.contentRef}>
            {events === null && isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="px-3 py-2 text-xs text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </div>
            ) : !events || events.length === 0 ? (
              <div className="flex flex-col px-3 py-2 text-xs text-muted-foreground">
                <span>No transcript yet. Claude may not have written its session log.</span>
                {isWorking && <WorkingIndicator startAt={workingStartAt} />}
              </div>
            ) : (
              <LastAssistantProvider event={lastAssistantEvent}>
                <div className="flex flex-col gap-2 p-2 pb-10">
                  {events.map((event, i) => (
                    <EventRow key={i} event={event} />
                  ))}
                  {isWorking && <WorkingIndicator startAt={workingStartAt} />}
                </div>
              </LastAssistantProvider>
            )}
          </div>
        </div>
        {totals && (
          <div
            className="pointer-events-auto absolute bottom-2 right-3 rounded-md border border-border/60 bg-background/85 px-2 py-1 tabular-nums text-xs text-muted-foreground shadow-sm backdrop-blur"
            title={`Latest context: ${totals.latestContext.toLocaleString()} tokens\nTotal output: ${totals.output.toLocaleString()} tokens`}
          >
            {formatTokenCount(totals.latestContext)} ctx · {formatTokenCount(totals.output)} out
          </div>
        )}
        <JumpToBottomButton
          handle={sticky}
          className="absolute bottom-12 right-4"
        />
      </div>
      {children}
    </div>
  );
}
