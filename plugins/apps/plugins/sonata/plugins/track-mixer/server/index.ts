import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { resetTrackView, upsertTrackView } from "../shared/endpoints";
import { handleResetTrackView, handleUpsertTrackView } from "./internal/routes";
import { trackViewLiveResource } from "./internal/resource";

export { _trackView } from "./internal/tables";
export { trackViewLiveResource } from "./internal/resource";

export default {
  description:
    "Persists per-(song, track) view overrides (color / muted / hidden) and serves the reactive rollup consumed by the piano-roll, the audio scheduler, and the track-mixer panel.",
  httpRoutes: {
    [upsertTrackView.route]: handleUpsertTrackView,
    [resetTrackView.route]: handleResetTrackView,
  },
  contributions: [Resource.Declare(trackViewLiveResource)],
} satisfies ServerPluginDefinition;
