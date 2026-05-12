import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { updateConversation } from "@plugins/tasks-core/server";
import { exitCleanFinalizeJob } from "./exit-clean-finalize-job";
import { setStatus } from "./state";

// `exit_clean` and `flag_raise` are the model-facing terminus of the
// push-and-exit flow. The toolbar button enqueues `pushAndExitJob` which
// (a) sends the wrap-up prompt and (b) starts a watchdog that flags the
// conversation if the model end_turns without calling either tool.
//
// `exit_clean` sets status synchronously and enqueues a finalize job that
// waits for end_turn before tearing down the runtime — calling
// `deleteConversation` here would yank the tmux session out from under a
// still-streaming response. `flag_raise` is fire-and-forget: a status
// write is safe mid-turn and the conversation stays open for the user.
//
// Both handlers are callable without an in-flight push-and-exit row so that
// the model can call them in response to an explicit "Exit" instruction
// outside of the toolbar-initiated flow.

export const exitCleanTool = Mcp.tool({
  name: "exit_clean",
  description: `Signal that the push-and-exit flow finished cleanly: the branch landed and there's nothing the user needs to know about. The conversation will close automatically after this turn ends.

Only call this in response to the push-and-exit prompt. If anything went wrong or there's something worth surfacing, call \`flag_raise\` instead.`,
  inputSchema: {},
  async handler(_args, { conversationId }) {
    await setStatus(conversationId, "clean", null);
    await updateConversation(conversationId, { closeRequested: true });
    await exitCleanFinalizeJob.enqueue(
      { conversationId },
      { jobKey: conversationId },
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, deferred: "close on end_turn" }),
        },
      ],
    };
  },
});

export const flagRaiseTool = Mcp.tool({
  name: "flag_raise",
  description: `Signal that the push-and-exit flow finished but something needs the user's attention — caveats, partial outcomes, follow-ups, skipped work, or the push didn't land. \`reason\` should be a short bullet list of what the user should know. The conversation stays open for the user to review.

Only call this in response to the push-and-exit prompt.`,
  inputSchema: {
    reason: z
      .string()
      .min(1)
      .describe(
        "Short bullets describing what the user should know — caveats, partial outcomes, follow-ups, skipped work, or push failure details.",
      ),
  },
  async handler({ reason }, { conversationId }) {
    await setStatus(conversationId, "flag", reason);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});
