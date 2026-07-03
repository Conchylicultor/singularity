import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import {
  PluginHealthReviewSchema,
  type PluginHealthReview,
} from "../core";

// Keyed query-resource contract: rows key on `id` (the review PK). The server
// half is compiled from the drizzle declaration in `server/internal/resource.ts`;
// the wire shape stays `PluginHealthReview[]`. The (pluginId, axis) order-by
// columns are the immutable review identity (the unique-index conflict target),
// so K/scoped is sound — a re-review UPDATEs commitHash/conversationId in place
// (one scoped keyed delta) without moving the row.
export const pluginHealthReviewsDescriptor =
  queryResourceDescriptor<PluginHealthReview>(
    "plugin-health-reviews",
    PluginHealthReviewSchema,
    "id",
  );
