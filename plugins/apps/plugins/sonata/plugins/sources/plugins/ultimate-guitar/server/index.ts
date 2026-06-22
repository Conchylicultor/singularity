import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { fetchUgTab } from "../shared/endpoints";
import { handleFetchUgTab } from "./internal/routes";

export { fetchUgTabContent } from "./internal/ug-client";

export default {
  description:
    "Fetches the raw Ultimate Guitar tab for a pasted UG tab URL via UG's private mobile API (Task 1: fetch only — no persistence, no markup parsing). Resolves the URL to a numeric tab id, signs the request, and fails loudly on auth/format/network breakage.",
  httpRoutes: {
    [fetchUgTab.route]: handleFetchUgTab,
  },
} satisfies ServerPluginDefinition;
