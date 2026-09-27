import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { resetTrackView, upsertTrackView } from "../shared/endpoints";
import { handleResetTrackView, handleUpsertTrackView } from "./internal/routes";
import { trackViewsServed } from "./internal/resource";

export { _trackView } from "./internal/tables";

export default {
  description:
    "Persists per-(song, track) view overrides (color / instrument / muted / hidden / volume) and serves them per song, consumed by the piano-roll, the audio scheduler, and the track-mixer panel.",
  httpRoutes: {
    [upsertTrackView.route]: handleUpsertTrackView,
    [resetTrackView.route]: handleResetTrackView,
  },
  contributions: [...trackViewsServed.declare],
} satisfies ServerPluginDefinition;
