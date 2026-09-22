import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConversationById } from "@plugins/conversations/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import {
  agentCallForSubagent,
  agentCallsIn,
  agentCallJoin,
  describedSubagent,
  subagentActivityResource,
  subagentRunState,
  type DescribedSubagent,
  type LastStep,
  type SubagentActivityRow,
  type SubagentRunState,
} from "../../core";

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;
type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

/**
 * One sub-agent of a conversation, with everything a list of them needs said
 * about it in one place.
 *
 * The row arm is deliberately the whole union: what a sub-agent last did and
 * when it started come from the FILESYSTEM, so they survive a meta file nothing
 * could read — a surface listing sub-agents still shows one whose metadata is
 * corrupt, rather than pretending it does not exist.
 */
export interface SubagentEntry {
  row: SubagentActivityRow;
  state: SubagentRunState;
  /** The meta file's stamp — when the harness created it. */
  startedAt: Date;
  /** When it last wrote. `null` while it is still running. */
  endedAt: Date | null;
  /** `null` = it has written nothing classifiable yet, not "it did nothing". */
  lastStep: LastStep | null;
  /**
   * The parent's `Agent` call that spawned it, when the parent transcript holds
   * one (`agentCallForSubagent`). Absent for an in-process teammate whose call
   * has scrolled out of the kept chain, and for every undescribed row.
   */
  agentToolEvent: ToolCallEvent | undefined;
}

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
 * Every sub-agent of one conversation, and the per-card read over the same data.
 *
 * `pending` until all three reads have landed, and one arm for the whole set:
 * "how many are working" must never be answered from a half-arrived transcript,
 * because the answer a surface would show — a count, an empty band — is a claim
 * about the user's work that then reverses itself.
 */
export type ConversationSubagents =
  | { kind: "pending" }
  | {
      kind: "known";
      /** Every sub-agent of the conversation, in start order. */
      entries: SubagentEntry[];
      /**
       * The same reading, as the card that launched ONE sub-agent sees it —
       * joined from the call rather than from the row, because a card holds its
       * own `Agent` event and that is the stronger evidence: the reverse join
       * can refuse (two calls asking for one name), and a card never has to.
       */
      statusOf: (args: {
        toolUseId: string;
        agentToolEvent: ToolCallEvent | undefined;
      }) => SubagentStatus;
    };

/**
 * The conversation's sub-agents — the list-level twin of `useSubagentStatus`,
 * and the one place the row ⇄ `Agent`-call join is done.
 *
 * Every caller in a conversation subscribes on the same id, and that is
 * deliberate: `useResource` is a TanStack Query wrapper, so N callers on
 * identical params share ONE query and ONE subscription. A band listing every
 * running sub-agent and a hundred cards each reading their own therefore cost
 * the same three reads.
 */
export function useConversationSubagents(
  conversationId: string | null,
): ConversationSubagents {
  const activity = useResource(subagentActivityResource, {
    id: conversationId ?? "",
  });
  const events = useResource(jsonlEventsResource, { id: conversationId ?? "" });
  const conversation = useConversationById(conversationId);

  // Gate FIRST, derive after — nothing below may run on a half-arrived read.
  // The parent transcript is where a BACKGROUND sub-agent's completion lives,
  // so reading a still-loading transcript as "no notifications" would report a
  // finished sub-agent as running until it landed: a surface asserting
  // something false about the user's work, which is the whole reason this arm
  // exists.
  if (activity.pending || events.pending || conversation === null) {
    return { kind: "pending" };
  }

  const rows = activity.data;
  const taskNotifications = events.data.filter(
    (e): e is TaskNotificationEvent => e.kind === "task-notification",
  );
  const agentCalls = agentCallsIn(events.data);
  const conversationStatus = conversation.status;

  const entries = rows.map((row): SubagentEntry => {
    const agentToolEvent = agentCallForSubagent(row, agentCalls);
    const state = subagentRunState({
      // The row's own id when it has one, else the id of the call that named it
      // — a teammate's completion notification carries the CALL's id, which is
      // the only id anything about this sub-agent is keyed by.
      toolUseId:
        (row.kind === "described" ? row.toolUseId : undefined) ??
        agentToolEvent?.toolUseId ??
        "",
      agentToolEvent,
      taskNotifications,
      requestShape: row.kind === "described" ? row.requestShape : undefined,
      conversationStatus,
    });
    return {
      row,
      state,
      startedAt: new Date(row.startedAt),
      // The last append is the closest thing to an end time; there is no exit
      // marker on disk. Only meaningful once it has stopped.
      endedAt: state.kind === "running" ? null : new Date(row.lastActivityAt),
      lastStep: row.lastStep,
      agentToolEvent,
    };
  });

  return {
    kind: "known",
    entries,
    statusOf: ({ toolUseId, agentToolEvent }) => {
      // The one sanctioned card → row join, which needs BOTH of a sub-agent's
      // keys: one spawned with a name is recorded as an in-process teammate and
      // gets no `toolUseId` at all, so an id-only join leaves its card with no
      // duration, no last step and a button onto a pane that never resolves.
      // The parent's own `Agent` call carries both, and `agentCallJoin` reads
      // them off it.
      //
      // With no such call recorded — a pane reached by an id the parent
      // transcript never held — the id is genuinely all there is, which the
      // join key spells directly rather than inventing a name to look up.
      const row = describedSubagent(
        rows,
        agentToolEvent ? agentCallJoin(agentToolEvent) : { toolUseId },
      );
      const state = subagentRunState({
        toolUseId,
        agentToolEvent,
        taskNotifications,
        requestShape: row?.requestShape,
        conversationStatus,
      });
      const startedAt = row?.startedAt ?? agentToolEvent?.at ?? null;
      return {
        kind: "known",
        state,
        row,
        startedAt: startedAt === null ? null : new Date(startedAt),
        endedAt:
          state.kind === "running" || row === undefined
            ? null
            : new Date(row.lastActivityAt),
      };
    },
  };
}
