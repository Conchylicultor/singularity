import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConversationById } from "@plugins/conversations/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import {
  agentCallJoin,
  describedSubagent,
  subagentActivityResource,
  subagentRunState,
  type DescribedSubagent,
  type SubagentRunState,
} from "../../core";

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;
type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

/**
 * Everything a surface needs to say about one sub-agent, in one read.
 *
 * `pending` is a real arm, not a nullable value: the run state is computed from
 * the PARENT transcript and the parent's own liveness, so until both have
 * arrived there is no honest answer — and "running" is the answer a surface
 * would otherwise default to, which is the one claim that ages into a lie.
 */
export type SubagentStatus =
  | { kind: "pending" }
  | {
      kind: "known";
      state: SubagentRunState;
      /**
       * `undefined` while the harness has not written the sub-agent's meta file
       * — it is STARTING, which is not the same as having done nothing. It is
       * also how a conversation whose sub-agent files have been cleaned up
       * reads, which is why the state below never depends on this being set.
       *
       * Always the DESCRIBED arm: only a described row carries the `toolUseId`
       * a card joins on, so a row reachable from a card is described by
       * construction. Its own optional fields (`model`, `requestShape`, …) stay
       * optional — present means the harness recorded it, absent means it did
       * not, and a surface renders the absence rather than filling it in.
       */
      row: DescribedSubagent | undefined;
      /** The meta file's stamp, else the parent's own `Agent` call time. */
      startedAt: Date | null;
      /** When it last wrote. `null` while it is still running. */
      endedAt: Date | null;
    };

/**
 * One sub-agent, joined by the parent's `Agent` tool-use id.
 *
 * Every card in a conversation calls this on the same conversation id, and
 * that is deliberate: `useResource` is a TanStack Query wrapper, so N callers
 * on identical params share ONE query and ONE subscription. The join is done
 * here, on the client, rather than by giving each card its own keyed read.
 */
export function useSubagentStatus({
  conversationId,
  toolUseId,
  agentToolEvent,
}: {
  conversationId: string | null;
  toolUseId: string;
  /** The parent's `Agent` tool-call event — the FOREGROUND completion signal. */
  agentToolEvent: ToolCallEvent | undefined;
}): SubagentStatus {
  const activity = useResource(subagentActivityResource, {
    id: conversationId ?? "",
  });
  const events = useResource(jsonlEventsResource, { id: conversationId ?? "" });
  const conversation = useConversationById(conversationId);

  // Gate FIRST, derive after — nothing below may run on a half-arrived read.
  // The parent transcript is where a BACKGROUND sub-agent's completion lives,
  // so reading a still-loading transcript as "no notifications" would report a
  // finished sub-agent as running until it landed: the card asserting something
  // false about the user's work, which is the whole reason this arm exists.
  if (activity.pending || events.pending || conversation === null) {
    return { kind: "pending" };
  }

  const taskNotifications = events.data.filter(
    (e): e is TaskNotificationEvent => e.kind === "task-notification",
  );
  // The one sanctioned card → row join, which needs BOTH of a sub-agent's keys:
  // one spawned with a name is recorded as an in-process teammate and gets no
  // `toolUseId` at all, so an id-only join leaves its card with no duration, no
  // last step and a button onto a pane that never resolves. The parent's own
  // `Agent` call carries both, and `agentCallJoin` reads them off it.
  //
  // With no such call recorded — a pane reached by an id the parent transcript
  // never held — the id is genuinely all there is, which the join key spells
  // directly rather than inventing a name to look up.
  const row = describedSubagent(
    activity.data,
    agentToolEvent ? agentCallJoin(agentToolEvent) : { toolUseId },
  );
  const state = subagentRunState({
    toolUseId,
    agentToolEvent,
    taskNotifications,
    requestShape: row?.requestShape,
    conversationStatus: conversation.status,
  });
  const startedAt = row?.startedAt ?? agentToolEvent?.at ?? null;

  return {
    kind: "known",
    state,
    row,
    startedAt: startedAt === null ? null : new Date(startedAt),
    // The last append is the closest thing to an end time; there is no exit
    // marker on disk. Only meaningful once it has stopped.
    endedAt:
      state.kind === "running" || row === undefined
        ? null
        : new Date(row.lastActivityAt),
  };
}
