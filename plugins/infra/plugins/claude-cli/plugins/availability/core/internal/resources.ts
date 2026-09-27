import { liveValue } from "@plugins/network/plugins/live/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ClaudeCodeStatusSchema } from "./status";

/**
 * This backend's last answer to "is Claude Code installed and signed in?",
 * pushed whenever it changes. A schema-bounded scalar. No placeholder: until
 * the first check lands, `useLive` reports it pending.
 */
export const claudeCodeStatus = liveValue("claude-code-status", {
  schema: ClaudeCodeStatusSchema,
});

/**
 * Check again now — the user just installed or signed in from a terminal,
 * which nothing on this machine announces. Answers with the fresh status (also
 * pushed through {@link claudeCodeStatus}).
 */
export const recheckClaudeCode = defineEndpoint({
  route: "POST /api/claude-code/recheck",
  response: ClaudeCodeStatusSchema,
});
