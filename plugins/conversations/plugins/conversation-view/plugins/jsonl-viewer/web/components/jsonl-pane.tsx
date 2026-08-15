import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import {
  JumpToBottomButton,
  useStickyScroll,
} from "@plugins/primitives/plugins/auto-scroll/web";

import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { jsonlEventsResource } from "../../core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { revealElement } from "@plugins/primitives/plugins/scroll-reveal/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { EventRow } from "./event-row";
import { LastAssistantProvider } from "./last-assistant-context";
import { ConversationIdProvider } from "./conversation-id-context";
import {
  usePendingTurns,
  reconcilePendingTurns,
  PendingTurnCard,
} from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { SectionExpandProvider } from "./section-sticky-context";
import { JsonlViewer } from "../slots";
import { useVisibleEvents } from "../use-visible-events";

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
      <Text
        as="span"
        variant="caption"
        className="tabular-nums text-muted-foreground/60"
      >
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
    if (expanded)
      revealElement(ref.current, { behavior: "smooth", block: "start" });
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

function EventSections({
  events,
  children,
}: {
  events: JsonlEvent[];
  children?: ReactNode;
}) {
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
            <StickyUserHeader>{renderEvent(section.start)}</StickyUserHeader>
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
  const isWorking =
    conversation.status === "working" || conversation.status === "starting";
  const isGone =
    conversation.status === "gone" || conversation.status === "done";
  const surfaceTabId = useSurfaceTabId();

  // Pending-turn feedback: the store owns the send lifecycle; this pane owns
  // the events array, so it drives the reconcile pass (transcript match,
  // deadline adoption, TTL) on every events change. Shown while working too —
  // that is exactly when messages queue.
  const pendingTurns = usePendingTurns(conversation.id);
  useEffect(() => {
    if (pendingTurns.length === 0) return;
    reconcilePendingTurns(conversation.id, events);
  }, [conversation.id, events, pendingTurns]);

  // Plugin-contributed hide predicates, via the shared owner — every surface
  // that enumerates the transcript must agree on which events exist.
  const visibleEvents = useVisibleEvents(events);
  const lastAssistantEvent = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.kind === "assistant-text") return events[i] ?? null;
    }
    return null;
  }, [events]);
  // Derive when "working" started: last event's timestamp, or now if none.
  // Seeded once per working transition (snapshot of the last event present at
  // the rising edge), kept out of render so we never read the clock during render.
  const [workingStartAt, setWorkingStartAt] = useState<number | null>(null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- rising-edge snapshot: fires only on the isWorking transition (dep array is intentionally [isWorking]) to freeze workingStartAt once at transition time; a render-derived value can't capture the clock once per edge without re-snapshotting on every new event. */
    if (isWorking) {
      if (workingStartAt == null) {
        const last = events.length ? events[events.length - 1] : null;
        const lastAt = last?.at ?? null;
        setWorkingStartAt(lastAt ? new Date(lastAt).getTime() : Date.now());
      }
    } else {
      setWorkingStartAt(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot events once per working transition
  }, [isWorking]);

  // Destructure at the call site: react-hooks/refs taints the handle object
  // (it carries scrollRef), so member access on it during render is flagged;
  // plain destructured locals are clean.
  //
  // No effect keyed on events.length any more: the hook watches its own bottom
  // sentinel, so new events, images loading and shiki resolving all settle
  // without this component knowing anything about it.
  //
  // followKey is the user sending a turn, NOT `isWorking`. A rising `isWorking`
  // also fires when a background agent resumes on its own, which must not yank a
  // reading user to the bottom.
  const { scrollRef, bottomSentinel, isFollowing, jumpToBottom } =
    useStickyScroll({
      followKey: pendingTurns.length,
      persist: {
        // Per surface, not just per conversation: two panes can be open on the
        // same conversation and are allowed to sit at different positions.
        key: `conversation-scroll:${conversation.id}:${surfaceTabId ?? "detached"}`,
        anchorAttr: "data-event-key",
      },
    });

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of JsonlPane's column; hosts the scroller plus the Pin'd overlays as siblings so they don't scroll
    <div className="relative min-h-0 flex-1 isolate">
      <Scroll
        axis="both"
        ref={scrollRef}
        data-pane-scroll
        className={`h-full transition-opacity ${isGone ? "opacity-50" : ""}`}
      >
        {events.length === 0 ? (
          <Text as="div" variant="caption" className="text-muted-foreground">
            <Stack gap="none" className="px-md py-sm">
              <span>
                No transcript yet. Claude may not have written its session log.
              </span>
              {isWorking && workingStartAt != null && (
                <WorkingIndicator startAt={workingStartAt} />
              )}
              {pendingTurns.map((r) => (
                <PendingTurnCard
                  key={r.id}
                  conversationId={conversation.id}
                  record={r}
                />
              ))}
            </Stack>
          </Text>
        ) : (
          <LastAssistantProvider event={lastAssistantEvent}>
            <EventSections events={visibleEvents}>
              {isWorking && workingStartAt != null && (
                <WorkingIndicator startAt={workingStartAt} />
              )}
              {!isWorking && !!conversation.waitingFor && (
                <JsonlViewer.PendingPrompt.Dispatch
                  conversationId={conversation.id}
                  waitingFor={conversation.waitingFor}
                />
              )}
              {pendingTurns.map((r) => (
                <PendingTurnCard
                  key={r.id}
                  conversationId={conversation.id}
                  record={r}
                />
              ))}
            </EventSections>
          </LastAssistantProvider>
        )}
        {/* Must stay the last child: it marks the true end of the content. */}
        {bottomSentinel}
      </Scroll>
      {/* The readings pinned at the foot of the pane (context/output usage, the
          token budget, …) are Overlay contributions now — see the
          `transcript-stats` sub-plugin, which owns the strip AND the reading
          position it reports as of. */}
      <JsonlViewer.Overlay.Render />
      <JumpToBottomButton
        handle={{ isFollowing, jumpToBottom }}
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
                <Text
                  as="div"
                  variant="caption"
                  className="px-md py-sm text-destructive"
                >
                  {err.message}
                </Text>
              </Scroll>
            </div>
          )}
        >
          {(events) => (
            <JsonlPaneInner conversation={conversation} events={events} />
          )}
        </ResourceView>
        {children}
      </Stack>
    </ConversationIdProvider>
  );
}
