import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  theorytabSectionEndpoint,
  trendNodesEndpoint,
  trendSongsEndpoint,
} from "../core";
import {
  handleTheorytabSection,
  handleTrendNodes,
  handleTrendSongs,
} from "./internal/handlers";

export {
  getTrendNodes,
  getTrendSongs,
  getTheorytabSection,
} from "./internal/client";

export default {
  description:
    "Hooktheory (TheoryTab) API client: getTrendNodes / getTrendSongs (signed-in account, token read from auth/central) and getTheorytabSection (public), every body zod-parsed at the fetch boundary; plus GET /api/hooktheory/{trends/nodes,trends/songs,sections/:id} wrappers.",
  httpRoutes: {
    [trendNodesEndpoint.route]: handleTrendNodes,
    [trendSongsEndpoint.route]: handleTrendSongs,
    [theorytabSectionEndpoint.route]: handleTheorytabSection,
  },
} satisfies ServerPluginDefinition;
