import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { listClaudeCliCallsFor } from "../core";
import { claudeCliCallsResource } from "./internal/resources";
import { handleListCallsFor } from "./internal/list-calls";

export { runClaudePrint, ClaudeCliError } from "./internal/run-claude-print";
export type { RunClaudePrintInput } from "./internal/run-claude-print";
export { _claudeCliCalls } from "./internal/tables";
export { claudeCliCallsResource } from "./internal/resources";
export { listCallsFor } from "./internal/list-calls";

export default {
  description:
    "One-shot Claude CLI helper (`claude --print`) for short, latency-tolerant generations. Reuses the user's local Claude CLI auth — no API key plumbing.",
  httpRoutes: {
    [listClaudeCliCallsFor.route]: handleListCallsFor,
  },
  contributions: [Resource.Declare(claudeCliCallsResource)],
} satisfies ServerPluginDefinition;
