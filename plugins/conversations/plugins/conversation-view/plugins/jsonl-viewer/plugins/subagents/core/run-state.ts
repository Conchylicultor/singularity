import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { hasLiveProcess } from "@plugins/conversations/core";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { toolResultIsOutcome, type SubagentRequestShape } from "./protocol";

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;
type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

/**
 * Where a sub-agent stands, as far as anything on disk can honestly say.
 *
 * Three arms, not two. A sub-agent whose parent never recorded a completion AND
 * whose parent is no longer running was killed, or died with the session — that
 * is **ended without reporting**, a thing the user can act on, and rendering it
 * as "running" would be the card lying about work that stopped minutes ago.
 */
export type SubagentRunState =
  | { kind: "running" }
  | { kind: "finished" }
  | { kind: "ended-without-reporting" };

export interface SubagentRunStateInput {
  /** The parent's `Agent` tool-use id — the join to everything below. */
  toolUseId: string;
  /**
   * The parent's `Agent` tool-call event, if the parent transcript has it yet.
   * Its `result` is the FOREGROUND completion signal.
   */
  agentToolEvent: ToolCallEvent | undefined;
  /** Every `task-notification` in the parent transcript — the BACKGROUND completion signal. */
  taskNotifications: readonly TaskNotificationEvent[];
  /** From the sub-agent's meta file. `undefined` = it has not landed yet. */
  requestShape: SubagentRequestShape | undefined;
  /**
   * The sub-agent's OWN transcript closes its newest turn (the row's
   * `turnEnded`). `undefined` = no row yet. Positive evidence only.
   */
  turnEnded: boolean | undefined;
  /** The parent conversation's status. */
  conversationStatus: ConversationStatus;
}

/**
 * The ONE computation of a sub-agent's state, so the card, the pane title and
 * any future consumer cannot disagree.
 *
 * The PARENT transcript is the authority where it speaks, and differently per
 * request shape:
 *
 * - **foreground** — the parent's `tool_result` lands only at completion, so its
 *   presence means finished.
 * - **background** — that `tool_result` is an immediate "launched"
 *   acknowledgement and means nothing; completion arrives later as the
 *   `task-notification` carrying the same tool-use id.
 * - **unknown shape** (meta not landed) — neither signal can be trusted to mean
 *   completion, so fall through.
 *
 * Then the sub-agent's OWN transcript: the harness streams an assistant message
 * in pieces with `stop_reason: null`, and only the last piece of an ended turn
 * carries `end_turn`. For a sub-agent started by ANOTHER sub-agent this is the
 * only signal there is — its launching call and any notification live in the
 * spawner's transcript, never the conversation's — so without it such a
 * sub-agent read "running" until the whole conversation stopped. It is
 * positive-only (older Claude Code versions never wrote it), and a named
 * teammate woken by a later message appends a user line, which the next read
 * sees as an open turn again.
 *
 * Last, the parent's own liveness.
 *
 * Deliberately NO staleness timeout as a fourth answer: a sub-agent that has
 * written nothing for five minutes may be inside one long tool call, and a
 * timeout would turn that into a claim the code cannot support. Surfaces state
 * the observation instead ("no update in 4m", from `lastActivityAt`).
 */
export function subagentRunState(
  input: SubagentRunStateInput,
): SubagentRunState {
  const { toolUseId, agentToolEvent, taskNotifications, requestShape } = input;

  if (
    toolResultIsOutcome(requestShape) &&
    agentToolEvent?.result !== undefined
  ) {
    return { kind: "finished" };
  }
  if (
    requestShape === "background" &&
    taskNotifications.some((n) => n.toolUseId === toolUseId)
  ) {
    return { kind: "finished" };
  }
  if (input.turnEnded === true) return { kind: "finished" };
  // No completion recorded. The parent is the only thing that can still be
  // hosting it, so its liveness decides between "still going" and "stopped
  // without ever saying so".
  return hasLiveProcess(input.conversationStatus)
    ? { kind: "running" }
    : { kind: "ended-without-reporting" };
}
