import { serveCollection } from "@plugins/network/plugins/live/server";
import { pluginHealthReviews } from "../../shared/schemas";
import { _pluginHealthReviews } from "./tables";

// Server half of the reviews collection, served straight from the entity table:
// the table ≡ `PluginHealthReview` by construction (one field record), so every
// row field binds to its column by name. A re-review UPDATEs the existing
// (pluginId, axis) row in place — its `axis` sort key never moves, so it stays
// an in-place upsert; a first review (INSERT) or a cleared one (DELETE) is a
// membership change of that plugin's window.
export const pluginHealthReviewsServed = serveCollection(pluginHealthReviews, {
  from: _pluginHealthReviews,
});
