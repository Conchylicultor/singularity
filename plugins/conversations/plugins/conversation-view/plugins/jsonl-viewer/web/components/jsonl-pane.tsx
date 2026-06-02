import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";

import type { Conversation } from "@plugins/tasks-core/core";
import { jsonlEventsResource } from "../../core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { formatTokenCount } from "../utils";
import { EventRow } from "./event-row";
import { LastAssistantProvider } from "./last-assistant-context";
import { StickyReportProvider } from "./section-sticky-context";
import { JsonlViewer } from "../slots";

interface UsageTotals {
  output: number;
  latestContext: number;
}

function aggregateUsage(events: JsonlEvent[]): UsageTotals | null {
  if (events.length === 0) return null;
  let output = 0;
  let latestContext = 0;
  let sawAny = false;
  for (const event of events) {
    if (event.kind !== "assistant-text" && event.kind !== "tool-call") continue;
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

function StickyUserHeader({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const report = useCallback((v: boolean) => setExpanded(v), []);
  return (
    <StickyReportProvider value={report}>
      <div
        className={
          expanded
            ? "z-10 bg-background pb-0.5"
            : "sticky top-0 z-20 bg-background pb-0.5 shadow-[0_2px_6px_-2px_rgba(0,0,0,0.1)]"
        }
      >
        {children}
      </div>
    </StickyReportProvider>
  );
}

function EventSections({ events, children }: { events: JsonlEvent[]; children?: ReactNode }) {
  const sections = useMemo(() => {
    const result: { start: number; end: number }[] = [];
    let sectionStart = 0;
    for (let i = 1; i < events.length; i++) {
      if (events[i]?.kind === "user-text") {
        result.push({ start: sectionStart, end: i });
        sectionStart = i;
      }
    }
    if (events.length > 0) {
      result.push({ start: sectionStart, end: events.length });
    }
    return result;
  }, [events]);

  const renderEvent = (i: number) => {
    const event = events[i]!;
    return (
      <EventRow
        key={event.kind === "tool-call" ? event.toolUseId : i}
        event={event}
        index={i}
      />
    );
  };

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-2 p-2 pb-10">
      {sections.map((section) => {
        const firstEvent = events[section.start]!;
        if (firstEvent.kind !== "user-text") {
          return (
            <Fragment key={section.start}>
              {Array.from({ length: section.end - section.start }, (_, j) =>
                renderEvent(section.start + j),
              )}
            </Fragment>
          );
        }
        return (
          <div key={section.start} className="flex flex-col gap-2">
            <StickyUserHeader>
              {renderEvent(section.start)}
            </StickyUserHeader>
            {Array.from({ length: section.end - section.start - 1 }, (_, j) =>
              renderEvent(section.start + 1 + j),
            )}
          </div>
        );
      })}
      {children}
    </div>
  );
}

export function JsonlPane({
  conversation,
  children,
}: {
  conversation: Conversation;
  children?: ReactNode;
}) {
  const isWorking = conversation.status === "working" || conversation.status === "starting";
  const isGone = conversation.status === "gone" || conversation.status === "done";
  const eventsResult = useResource(jsonlEventsResource, {
    id: conversation.id,
  });
  const events = useMemo(
    () => eventsResult.pending ? [] : eventsResult.data,
    [eventsResult],
  );
  const totals = useMemo(() => aggregateUsage(events), [events]);
  // Plugin-contributed hide predicates. Computed over the full `events` so the
  // EventFilter slot can remove individual rows (e.g. a raw answer turn already
  // shown inside a card) that the EventRenderer's predicate tier can't suppress.
  const filters = JsonlViewer.EventFilter.useContributions();
  const visibleEvents = useMemo(
    () => events.filter((e) => !filters.some((f) => f.hide(e))),
    [events, filters],
  );
  const lastAssistantEvent = useMemo(() => {
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
      const lastEvent = events.length ? events[events.length - 1] : null;
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
  const { scrollIfPinned } = sticky;

  useEffect(() => {
    scrollIfPinned();
  }, [events.length, scrollIfPinned]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={sticky.scrollRef}
          data-pane-scroll
          className={`h-full overflow-auto transition-opacity ${isGone ? "opacity-50" : ""}`}
        >
          {eventsResult.pending ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : eventsResult.error ? (
            <div className="px-3 py-2 text-xs text-destructive">
              {eventsResult.error instanceof Error ? eventsResult.error.message : String(eventsResult.error)}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col px-3 py-2 text-xs text-muted-foreground">
              <span>No transcript yet. Claude may not have written its session log.</span>
              {isWorking && <WorkingIndicator startAt={workingStartAt} />}
            </div>
          ) : (
            <LastAssistantProvider event={lastAssistantEvent}>
              <EventSections events={visibleEvents}>
                {isWorking && <WorkingIndicator startAt={workingStartAt} />}
                {!isWorking && !!conversation.waitingFor && (
                  <JsonlViewer.PendingPrompt.Dispatch
                    conversationId={conversation.id}
                    waitingFor={conversation.waitingFor}
                  />
                )}
              </EventSections>
            </LastAssistantProvider>
          )}
        </div>
        {totals && (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10">
            <div className="mx-auto flex max-w-reading justify-end px-3">
              <span
                className="pointer-events-auto tabular-nums text-xs text-muted-foreground/60"
                title={`Latest context: ${totals.latestContext.toLocaleString()} tokens\nTotal output: ${totals.output.toLocaleString()} tokens`}
              >
                {formatTokenCount(totals.latestContext)} ctx · {formatTokenCount(totals.output)} out
              </span>
            </div>
          </div>
        )}
        <JsonlViewer.Overlay.Render />
        <JumpToBottomButton
          handle={sticky}
          className="absolute bottom-12 right-4 z-20"
        />
      </div>
      {children}
    </div>
  );
}
