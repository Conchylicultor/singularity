import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { exitCleanFinalizeJob } from "./exit-clean-finalize-job";
import { readStatus, setStatus } from "./state";

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
// Both handlers no-op when no push-and-exit row exists for the
// conversation: the model could in principle call these tools without
// being prompted, and we don't want a stray call to delete a conversation
// the user didn't ask to close.

Mcp.registerTool({
  name: "exit_clean",
  description: `Signal that the push-and-exit flow finished cleanly: the branch landed and there's nothing the user needs to know about. The conversation will close automatically after this turn ends.

Only call this in response to the push-and-exit prompt. If anything went wrong or there's something worth surfacing, call \`flag_raise\` instead.`,
  inputSchema: {},
  async handler(_args, { conversationId }) {
    const current = await readStatus(conversationId);
    if (current === null) {
      throw new Error(
        "exit_clean called for a conversation with no in-flight push-and-exit. Only call this tool in response to the push-and-exit prompt.",
      );
    }
    await setStatus(conversationId, "clean", null);
    // Namespaced jobKey: `pushAndExitJob` already uses `jobKey: conversationId`,
    // so a bare conversationId here would give both jobs the same
    // `workflowRunId`. When the shared `end_turn` event resolves both waits,
    // each `jobs.resume` re-enqueues its target with `jobKey: workflowRunId`,
    // and graphile's replace-on-unlocked-key semantics drop one of them on
    // the floor — typically `exitCleanFinalizeJob`, leaving the conversation
    // stuck open. The 60s timeout fallback dies too: `jobs.resume` already
    // marked the wait row resolved before its `addJob` was clobbered.
    await exitCleanFinalizeJob.enqueue(
      { conversationId },
      { jobKey: `exit-clean:${conversationId}` },
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

Mcp.registerTool({
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
    const current = await readStatus(conversationId);
    if (current === null) {
      throw new Error(
        "flag_raise called for a conversation with no in-flight push-and-exit. Only call this tool in response to the push-and-exit prompt.",
      );
    }
    await setStatus(conversationId, "flag", reason);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});
