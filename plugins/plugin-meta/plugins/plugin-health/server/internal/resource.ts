import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { pluginHealthReviewsDescriptor } from "../../shared/schemas";
import { _pluginHealthReviews } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("plugin_health_reviews") all derive from this one declaration.
// The table ≡ `PluginHealthReview` by construction, so the loader keeps its
// select-all (no projection). A re-review UPDATEs an existing (pluginId, axis)
// row in place → one scoped keyed delta; the (pluginId, axis) order-by columns
// are that row's immutable identity, so its position never goes stale.
//
// `scopedMembership: true` (M5): the review set is bounded by the domain (at most
// one row per (pluginId, axis), so its size tracks the plugin count, not usage),
// which is why the whole-array wire shape is correct here. A first review of a
// plugin (INSERT) or a review being cleared (DELETE) is a membership change that
// used to force a whole-list FULL recompute; now an INSERT enters via the derived
// `orderOf` and a DELETE ships a delete + order with no loader run. The in-place
// re-review UPDATE above is unchanged.
export const pluginHealthReviewsResource = queryResource(
  pluginHealthReviewsDescriptor,
  {
    from: _pluginHealthReviews,
    orderBy: [
      asc(_pluginHealthReviews.pluginId),
      asc(_pluginHealthReviews.axis),
    ],
    scopedMembership: true,
  },
);
