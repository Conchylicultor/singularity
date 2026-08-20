import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CommitRail,
  MergeBaseMarker,
  commitRowHeight,
} from "./internal/commit-rail";
export { CommitRowItem } from "./internal/commit-row-item";
export { CommitRowSchema } from "../core";
export type { CommitRow } from "../core";

export default {
  description: "Reusable commit row rendering and git log types.",
  contributions: [],
} satisfies PluginDefinition;
