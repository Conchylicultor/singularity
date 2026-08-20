import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ExcludeFromFork } from "@plugins/database/plugins/admin/server";
import { listClaudeCliCallsFor } from "../core";
import { claudeCliCallsResource } from "./internal/resources";
import { handleListCallsFor } from "./internal/list-calls";
import { _claudeCliCalls } from "./internal/tables";

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
  contributions: [
    Resource.Declare(claudeCliCallsResource),
    // Calls are looked up by `correlationId`, minted per-record in the consuming
    // domain table. Inherited rows can therefore answer a fork-local correlation
    // query with one of main's calls. The table is also trimmed to the global
    // most-recent 1000 rows on insert rather than by a per-worktree TTL, so a
    // fork carries main's backlog until it makes 1000 calls of its own.
    ExcludeFromFork({
      table: _claudeCliCalls,
      reason:
        "Host-local model-call log; inherited rows answer fork-local correlation lookups with main's calls, and nothing sweeps them per worktree.",
    }),
  ],
} satisfies ServerPluginDefinition;
