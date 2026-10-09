import { sql } from "drizzle-orm";
import { serveCollection } from "@plugins/network/plugins/live/server";
import { expr } from "@plugins/infra/plugins/query-resource/core";
import { parsed } from "@plugins/database/plugins/sql-projection/server";
import {
  claudeCliCalls,
  ClaudeCliCallStatusSchema,
} from "../../core/resources";
import { _claudeCliCalls } from "./tables";

// The call log over `claude_cli_calls`: its scroll window (newest first,
// filterable / searchable — see the collection), its `:rows` point sibling and
// the `:groups` the pane's Source / Model facets read. The table row and
// `ClaudeCliCall` both derive from the single `claudeCliCallFields` record
// (core), so every stored field binds to its column by name; `status` is the
// one computed field — `error IS NOT NULL`, the same fact `error` states, so it
// cannot drift from it. A call is written once and never updated; the
// recorder's trim to `RECENT_CALLS_LIMIT` is a window delete.
export const claudeCliCallsServed = serveCollection(claudeCliCalls, {
  from: _claudeCliCalls,
  columns: {
    status: (j) =>
      expr(
        sql`(CASE WHEN ${j.base.error} IS NULL THEN 'ok' ELSE 'error' END)`,
        {
          decoder: parsed(ClaudeCliCallStatusSchema, "claude-cli-calls.status"),
          sqlType: "text",
          notNull: true,
        },
      ),
  },
});
