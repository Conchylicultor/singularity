import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { pluginHealthReviewsDescriptor } from "../../shared/schemas";
import { _pluginHealthReviews } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("plugin_health_reviews") all derive from this one declaration.
// The table ≡ `PluginHealthReview` by construction, so the loader keeps its
// select-all (no projection). A re-review UPDATEs an existing (pluginId, axis)
// row in place → one scoped keyed delta; the (pluginId, axis) order-by columns
// are that row's immutable identity, so its position never goes stale. New
// reviews / deletes are membership changes → FULL.
export const pluginHealthReviewsResource = queryResource(
  pluginHealthReviewsDescriptor,
  {
    from: _pluginHealthReviews,
    orderBy: [
      asc(_pluginHealthReviews.pluginId),
      asc(_pluginHealthReviews.axis),
    ],
  },
);
