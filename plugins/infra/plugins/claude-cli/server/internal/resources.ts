import { serveCollection } from "@plugins/network/plugins/live/server";
import { claudeCliCalls } from "../../core/resources";
import { _claudeCliCalls } from "./tables";

// The call log over `claude_cli_calls`: its window (newest first, filterable on
// `sourceName` / `model`), its `:rows` point sibling and the `:groups` the
// pane's source chips read. The table row and `ClaudeCliCall` both derive from
// the single `claudeCliCallFields` record (core), so every row field binds to
// its column by name. A call is written once and never updated; the recorder's
// trim to `RECENT_CALLS_LIMIT` is a window delete.
export const claudeCliCallsServed = serveCollection(claudeCliCalls, {
  from: _claudeCliCalls,
});
