import { defineConfig } from "@plugins/config_v2/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";

export const pushAndExitConfig = defineConfig({
  fields: {
    prompt: multilineTextField({
      label: "Push & Exit prompt",
      description:
        "Prompt sent to Claude when the Push & Exit button is pressed.",
      default: `Please wrap up this conversation:

1. Push this branch to main using the CLI.
2. Then call exactly one MCP tool to signal the outcome:
   - \`exit_clean\` — everything went smoothly, nothing I need to know. The conversation will close automatically.
   - \`flag_raise({ reason })\` — something needs my attention (caveats, partial outcomes, follow-ups, skipped work, or the push didn't land). Use \`reason\` for short bullets describing what I should know.
3. Write your final wrap up message, including things like summary, issues encountered, existing caveats, follow ups.`,
    }),
  },
});
