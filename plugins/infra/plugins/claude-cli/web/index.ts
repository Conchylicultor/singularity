import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useClaudeCliCalls } from "./internal/use-claude-cli-calls";
export { ClaudeCliCallDetail } from "./components/claude-cli-call-detail";

export default {
  description:
    "Consumer half of the claude-cli call log: useClaudeCliCalls({correlationId, occurredAt}) answers 'which model calls produced this record?' as a calls / none / not-retained result, and <ClaudeCliCallDetail> is the one rendering of a recorded call (system, prompt, output or error, meta).",
  contributions: [],
} satisfies PluginDefinition;
