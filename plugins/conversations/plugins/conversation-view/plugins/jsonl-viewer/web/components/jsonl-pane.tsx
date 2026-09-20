import { useEffect, useState, type ReactNode } from "react";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";

import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { jsonlEventsResource } from "../../core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ElapsedTime } from "@plugins/primitives/plugins/relative-time/web";
import { ConversationIdProvider } from "./conversation-id-context";
import { TranscriptView } from "./transcript-view";
import {
  usePendingTurns,
  reconcilePendingTurns,
  PendingTurnCard,
} from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { JsonlViewer } from "../slots";

function WorkingIndicator({ startAt }: { startAt: number }) {
  return (
    <Stack direction="row" align="center" gap="sm" className="px-xs py-xs">
      <BouncingDots />
      <Text
        as="span"
        variant="caption"
        className="tabular-nums text-muted-foreground/60"
      >
        Working for <ElapsedTime since={new Date(startAt)} />
      </Text>
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

  // Pending-turn feedback: the store owns the send lifecycle; this pane owns
  // the events array, so it drives the reconcile pass (transcript match,
  // deadline adoption, TTL) on every events change. Shown while working too —
  // that is exactly when messages queue.
  const pendingTurns = usePendingTurns(conversation.id);
  useEffect(() => {
    if (pendingTurns.length === 0) return;
    reconcilePendingTurns(conversation.id, events);
  }, [conversation.id, events, pendingTurns]);

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

  return (
    <TranscriptView
      events={events}
      conversationId={conversation.id}
      // The surface tab is appended by the view — name only the subject here.
      persistKey={`conversation-scroll:${conversation.id}`}
      // The user sending a turn, NOT `isWorking`. A rising `isWorking` also
      // fires when a background agent resumes on its own, which must not yank a
      // reading user to the bottom.
      followKey={pendingTurns.length}
      dimmed={isGone}
      empty={
        <span>
          No transcript yet. Claude may not have written its session log.
        </span>
      }
      // The readings pinned at the foot of the pane (context/output usage, the
      // token budget, …) are Overlay contributions — see the
      // `transcript-stats` sub-plugin, which owns the strip AND the reading
      // position it reports as of. Conversation-scoped, so the conversation
      // hands them to the view rather than the view knowing about them.
      overlay={<JsonlViewer.Overlay.Render />}
    >
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
    </TranscriptView>
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
    // Declared out here as well as inside `TranscriptView`, and it is not a
    // duplicate: this one says "the whole pane is about this conversation", so
    // the composer below and the loading/error branches — which render no
    // transcript at all — can still answer the question. The view declares it
    // again for the rows it draws, which is what makes a transcript surface
    // that is NOT a conversation pane (a sub-agent's own) still able to say
    // which conversation its rows came from.
    <ConversationIdProvider id={conversation.id}>
      <Stack gap="none" className="h-full min-h-0">
        <ResourceView
          resource={eventsResult}
          fallback={
            // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of the transcript column (mirrors TranscriptView)
            <div className="relative min-h-0 flex-1 isolate">
              <Scroll axis="both" data-pane-scroll className="h-full">
                <Loading className="px-md py-sm" />
              </Scroll>
            </div>
          }
          errorFallback={(err) => (
            // eslint-disable-next-line layout/no-adhoc-layout -- relative+isolate positioning host that is also the flex-fill child of the transcript column (mirrors TranscriptView)
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
