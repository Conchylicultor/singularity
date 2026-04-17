export const PUSH_AND_EXIT_PROMPT = `Please wrap up this conversation:

1. Push this branch to main using the CLI.
2. End your FINAL message with one of these tokens on its own line, as the very last line — nothing may follow it:
   - \`PUSH_EXIT_CLEAN\` — everything went smoothly, nothing I need to know.
   - \`PUSH_EXIT_FLAG\` — something needs my attention (caveats, partial outcomes, follow-ups, skipped work, or the push didn't land). Above the token, list what I should know as short bullets.`;

export const CLEAN_TOKEN = "PUSH_EXIT_CLEAN";
export const FLAG_TOKEN = "PUSH_EXIT_FLAG";
