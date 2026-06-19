import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
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
import { SectionExpandProvider } from "./section-sticky-context";
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
    <Stack direction="row" align="center" gap="sm" className="px-xs py-xs">
      <BouncingDots />
      <Text as="span" variant="caption" className="tabular-nums text-muted-foreground/60">
        Working for {formatElapsed(elapsed)}
      </Text>
    </Stack>
  );
}

function StickyUserHeader({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const value = useMemo(() => ({ expanded, setExpanded }), [expanded]);
  // A pinned turn loses `position: sticky` the moment it expands, so it snaps
  // back to its natural scroll position — which sits above the viewport and
  // carries the just-expanded message out of view. Scroll it back to the top of
  // the pane so it stays where the user was looking. Stickiness is toggled via
  // the `active` prop on a single stable element (never by swapping element
  // types), so the subtree never remounts.
  useLayoutEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expanded]);
  return (
    <SectionExpandProvider value={value}>
      <Sticky
        ref={ref}
        active={!expanded}
        edge="top"
        layer="nav"
        className={`bg-background pb-2xs ${expanded ? "z-raised" : "shadow-[0_2px_6px_-2px_rgba(0,0,0,0.1)]"}`}
      >
        {children}
      </Sticky>
    </SectionExpandProvider>
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
    <Stack gap="sm" className="mx-auto max-w-reading p-sm pb-2xl">
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
          <Stack key={section.start} gap="sm">
            <StickyUserHeader>
              {renderEvent(section.start)}
            </StickyUserHeader>
            {Array.from({ length: section.end - section.start - 1 }, (_, j) =>
              renderEvent(section.start + 1 + j),
            )}
          </Stack>
        );
      })}
      {children}
    </Stack>
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
    // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of JsonlPane's column; hosts the scroller plus the Pin'd overlays as siblings so they don't scroll
    <div className="relative min-h-0 flex-1 isolate">
      <Scroll
        axis="both"
        ref={sticky.scrollRef}
        data-pane-scroll
        className={`h-full transition-opacity ${isGone ? "opacity-50" : ""}`}
      >
        {events.length === 0 ? (
          <Text as="div" variant="caption" className="text-muted-foreground">
            <Stack gap="none" className="px-md py-sm">
              <span>No transcript yet. Claude may not have written its session log.</span>
              {isWorking && <WorkingIndicator startAt={workingStartAt} />}
              {showPending && <PendingTurnEcho text={pending!.text} />}
            </Stack>
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
      </Scroll>
      {totals && (
        <Pin to="bottom" stretch offset="sm" layer="raised" decorative>
          <Stack direction="row" justify="end" gap="none" className="mx-auto max-w-reading px-md">
            <Badge
              colorClass="bg-background/80 text-muted-foreground/60 backdrop-blur-sm"
              className="pointer-events-auto"
              title={`Latest context: ${totals.latestContext.toLocaleString()} tokens\nTotal output: ${totals.output.toLocaleString()} tokens`}
            >
              {formatTokenCount(totals.latestContext)} ctx · {formatTokenCount(totals.output)} out
            </Badge>
          </Stack>
        </Pin>
      )}
      <JsonlViewer.Overlay.Render />
      <JumpToBottomButton
        handle={sticky}
        // eslint-disable-next-line layout/no-adhoc-layout -- off-ramp corner pin on an external Button (self-renders null when hidden); bottom-12/right-4 are off the spacing ramp
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
      <Stack gap="none" className="h-full min-h-0">
        <ResourceView
          resource={eventsResult}
          fallback={
            // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of the transcript column (mirrors JsonlPaneInner)
            <div className="relative min-h-0 flex-1 isolate">
              <Scroll axis="both" data-pane-scroll className="h-full">
                <Loading className="px-md py-sm" />
              </Scroll>
            </div>
          }
          errorFallback={(err) => (
            // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of the transcript column (mirrors JsonlPaneInner)
            <div className="relative min-h-0 flex-1 isolate">
              <Scroll axis="both" data-pane-scroll className="h-full">
                <Text as="div" variant="caption" className="px-md py-sm text-destructive">
                  {err.message}
                </Text>
              </Scroll>
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
      </Stack>
    </ConversationIdProvider>
  );
}
