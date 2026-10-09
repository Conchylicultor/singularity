import {
  QuestionHolds,
  type QuestionHold,
} from "@plugins/conversations/server";
import {
  abandonDeadHolds,
  isPidAlive,
  latestHolds,
  releaseOpenHolds,
} from "./store";
import { wakeQuestion } from "./waiters";

// The relay as a question-hold source for the status reconciler: a
// conversation's LATEST held question decides. `open` with a live relay is a
// question waiting with no menu; `released` means the menu that opens is the
// one the user asked for (never auto-flushed). An open row whose relay died is
// absent here and retired by `reap`. `release` is a message sent instead of an
// answer: the relay lets go, the CLI draws its menu, and the send dismisses it.
export const relayQuestionHolds = QuestionHolds.define({
  async read(ids) {
    const holds = new Map<string, QuestionHold>();
    for (const row of await latestHolds(ids)) {
      if (row.state === "open" && isPidAlive(row.relayPid)) {
        holds.set(row.conversationId, "open");
      } else if (row.state === "released") {
        holds.set(row.conversationId, "released");
      }
    }
    return holds;
  },
  async reap(ids) {
    for (const { toolUseId } of await abandonDeadHolds(ids)) {
      wakeQuestion(toolUseId);
    }
  },
  async release(ids) {
    for (const { toolUseId } of await releaseOpenHolds(ids)) {
      wakeQuestion(toolUseId);
    }
  },
});
