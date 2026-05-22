import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { CommitRail, MergeBaseMarker, COMMIT_ROW_HEIGHT } from "./internal/commit-rail";
export { CommitRowItem } from "./internal/commit-row-item";
export { CommitRowSchema } from "../core";
export type { CommitRow } from "../core";

export default {
  id: "commit-list",
  name: "Commit List",
  description: "Reusable commit row rendering and git log types.",
  contributions: [],
} satisfies PluginDefinition;
