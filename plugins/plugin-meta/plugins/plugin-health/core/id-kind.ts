import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A plugin-health review's id (`plugin_health_reviews.id`), declared once
 * (`plugins/ids`). Rows minted as `review-<ms>-<≤6>` stay recognised.
 */
export const pluginReviewIdKind = defineIdKind({
  prefix: "review",
  label: "Plugin health review",
});

export type PluginReviewId = IdOf<typeof pluginReviewIdKind>;
