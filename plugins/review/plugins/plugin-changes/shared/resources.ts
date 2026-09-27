import { liveValue } from "@plugins/network/plugins/live/core";
import { PluginChangesSchema } from "../core";

// The plugins a conversation's worktree added or modified relative to `main`,
// each with its files and raw facet data (the client diffs the facets). One
// payload per conversation, recomputed whole. Not loaded yet is `pending` — a
// value has no placeholder, so an unloaded review never reads as "no plugin
// changes".
export const pluginChanges = liveValue("review.plugin-changes", {
  schema: PluginChangesSchema,
  params: ["conversationId"],
});
