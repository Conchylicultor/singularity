import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ClaudeCodeStatusSchema, type ClaudeCodeStatus } from "./status";

/**
 * This backend's last answer to "is Claude Code installed and signed in?",
 * pushed whenever it changes. A schema-bounded scalar. `initialData` is never
 * shown: until the first check lands, `useResource` reports it pending.
 */
export const claudeCodeStatusResource = resourceDescriptor<ClaudeCodeStatus>(
  "claude-code-status",
  ClaudeCodeStatusSchema,
  { kind: "unreadable", error: "Not checked yet" },
);

/**
 * Check again now — the user just installed or signed in from a terminal,
 * which nothing on this machine announces. Answers with the fresh status (also
 * pushed through {@link claudeCodeStatusResource}).
 */
export const recheckClaudeCode = defineEndpoint({
  route: "POST /api/claude-code/recheck",
  response: ClaudeCodeStatusSchema,
});
