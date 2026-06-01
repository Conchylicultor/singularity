import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { claudeCliCallsResource } from "./internal/resources";

export { runClaudePrint, ClaudeCliError } from "./internal/run-claude-print";
export type { RunClaudePrintInput } from "./internal/run-claude-print";
export { _claudeCliCalls } from "./internal/tables";
export { claudeCliCallsResource } from "./internal/resources";

export default {
  id: "claude-cli",
  name: "Claude CLI",
  description:
    "One-shot Claude CLI helper (`claude --print`) for short, latency-tolerant generations. Reuses the user's local Claude CLI auth — no API key plumbing.",
  contributions: [Resource.Declare(claudeCliCallsResource)],
} satisfies ServerPluginDefinition;
