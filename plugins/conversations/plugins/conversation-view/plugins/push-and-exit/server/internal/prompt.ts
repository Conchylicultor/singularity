// First line is the anchor used by `endTurnIsAfterPushPrompt` to identify
// the push-and-exit user message in the JSONL transcript. Don't change it
// without updating the needle in push-and-exit-job.ts.
export const PUSH_AND_EXIT_PROMPT = `Please wrap up this conversation:

1. Push this branch to main using the CLI.
2. Then call exactly one MCP tool to signal the outcome:
   - \`exit_clean\` — everything went smoothly, nothing I need to know. The conversation will close automatically.
   - \`flag_raise({ reason })\` — something needs my attention (caveats, partial outcomes, follow-ups, skipped work, or the push didn't land). Use \`reason\` for short bullets describing what I should know.
3. Write your final wrap up message, including things like summary, issues encountered, existing caveats, follow ups.`;

export const PUSH_AND_EXIT_PROMPT_ANCHOR = "Please wrap up this conversation:";
