import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";

import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { jsonlEventsResource } from "../../core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { formatTokenCount } from "../utils";
import { EventRow } from "./event-row";
import { LastAssistantProvider } from "./last-assistant-context";
import { ConversationIdProvider } from "./conversation-id-context";
import {
  usePendingTurn,
  clearPendingTurn,
  PendingTurnEcho,
} from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
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
    <div className="flex items-center gap-sm px-xs py-xs">
      <BouncingDots />
      <Text as="span" variant="caption" className="tabular-nums text-muted-foreground/60">
        Working for {formatElapsed(elapsed)}
      </Text>
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
            ? "z-raised bg-background pb-2xs"
            : "sticky top-0 z-nav bg-background pb-2xs shadow-[0_2px_6px_-2px_rgba(0,0,0,0.1)]"
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
    <div className="mx-auto flex max-w-reading flex-col gap-sm p-sm pb-2xl">
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
          <div key={section.start} className="flex flex-col gap-sm">
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

function JsonlPaneInner({
  conversation,
  events,
}: {
  conversation: Conversation;
  events: JsonlEvent[];
}) {
  const isWorking = conversation.status === "working" || conversation.status === "starting";
  const isGone = conversation.status === "gone" || conversation.status === "done";

  // Optimistic echo of a just-sent turn: bridge the feedback gap between the
  // turn POST succeeding and the conversation flipping to `working` (and the
  // real user-text event streaming in). Only shown while idle and live.
  const pending = usePendingTurn(conversation.id);
  const showPending = !!pending && !isWorking && !isGone;

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
  }, [events.length, pending?.sendId, scrollIfPinned]);

  // Capture the event count at the moment a pending turn was registered, so we
  // can detect when the real user-text event has streamed in (count grows past
  // the baseline) without depending on event timestamps.
  const pendingBaselineRef = useRef<number | null>(null);
  useEffect(() => {
    pendingBaselineRef.current = pending ? events.length : null;
    // Intentionally keyed only on the pending sendId: snapshot the count once
    // per send, not on every event change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.sendId]);

  useEffect(() => {
    if (!pending) return;
    const baseline = pendingBaselineRef.current;
    if (isGone || (baseline != null && events.length > baseline)) {
      clearPendingTurn(conversation.id);
    }
  }, [events.length, pending, isGone, conversation.id]);

  return (
    <div className="relative min-h-0 flex-1 isolate">
      <div
        ref={sticky.scrollRef}
        data-pane-scroll
        className={`h-full overflow-auto transition-opacity ${isGone ? "opacity-50" : ""}`}
      >
        {events.length === 0 ? (
          <Text as="div" variant="caption" className="flex flex-col px-md py-sm text-muted-foreground">
            <span>No transcript yet. Claude may not have written its session log.</span>
            {isWorking && <WorkingIndicator startAt={workingStartAt} />}
            {showPending && <PendingTurnEcho text={pending!.text} />}
          </Text>
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
              {showPending && <PendingTurnEcho text={pending!.text} />}
            </EventSections>
          </LastAssistantProvider>
        )}
      </div>
      {totals && (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-raised">
          <div className="mx-auto flex max-w-reading justify-end px-md">
            <Badge
              colorClass="bg-background/80 text-muted-foreground/60 backdrop-blur-sm"
              className="pointer-events-auto"
              title={`Latest context: ${totals.latestContext.toLocaleString()} tokens\nTotal output: ${totals.output.toLocaleString()} tokens`}
            >
              {formatTokenCount(totals.latestContext)} ctx · {formatTokenCount(totals.output)} out
            </Badge>
          </div>
        </div>
      )}
      <JsonlViewer.Overlay.Render />
      <JumpToBottomButton
        handle={sticky}
        className="absolute bottom-12 right-4 z-nav"
      />
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
  const eventsResult = useResource(jsonlEventsResource, {
    id: conversation.id,
  });

  return (
    <ConversationIdProvider id={conversation.id}>
      <div className="flex h-full min-h-0 flex-col">
        <ResourceView
          resource={eventsResult}
          fallback={
            <div className="relative min-h-0 flex-1 isolate">
              <div data-pane-scroll className="h-full overflow-auto">
                <Loading className="px-md py-sm" />
              </div>
            </div>
          }
          errorFallback={(err) => (
            <div className="relative min-h-0 flex-1 isolate">
              <div data-pane-scroll className="h-full overflow-auto">
                <Text as="div" variant="caption" className="px-md py-sm text-destructive">
                  {err.message}
                </Text>
              </div>
            </div>
          )}
        >
          {(events) => (
            <JsonlPaneInner
              conversation={conversation}
              events={events}
            />
          )}
        </ResourceView>
        {children}
      </div>
    </ConversationIdProvider>
  );
}
