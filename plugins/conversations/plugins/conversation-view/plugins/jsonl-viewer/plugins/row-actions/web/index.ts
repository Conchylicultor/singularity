import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { JsonlRowActions } from "./slots";
export type { RowActionContribution } from "./slots";
export { EventActionProvider, RowActions } from "./internal/event-action-context";
export { RowActionButton, rowActionClass } from "./components/row-action-button";
export { CopyTextAction } from "./components/copy-button";

export default {
  collapsed: true,
  description:
    "Owns the JSONL transcript's hover-revealed row-action strip: the JsonlRowActions.Item slot, the per-event context, and the shared action-button styling. Sits below collapsible-card so card chrome can host the strip without a cycle.",
  contributions: [],
} satisfies PluginDefinition;
