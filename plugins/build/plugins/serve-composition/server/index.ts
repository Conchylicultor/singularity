import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  ownedNamespacesEndpoint,
  reclaimCompositionNamespaces,
  resetCompositionData,
  serveStatusEndpoint,
} from "../shared/endpoints";
import { handleOwnedNamespaces } from "./internal/handle-owned";
import { handleReclaim } from "./internal/handle-reclaim";
import { handleReset } from "./internal/handle-reset";
import { handleServeStatus } from "./internal/handle-status";

export default {
  description:
    "Serve-liveness read for a composition: WHERE this backend's checkout serves it (the server-resolved namespace + url) and whether anything is actually there (the composition.json marker), plus the reset-to-first-launch endpoint — wipes ONLY that namespace's DB + config back to what a serve build provisions on a fresh serve, then restarts its backend. Never touches the checkout's own app. Also answers what a composition owns across EVERY checkout that has served it (the marker scan behind the delete confirmation) and reclaims that whole set, per-namespace outcomes reported individually.",
  httpRoutes: {
    [resetCompositionData.route]: handleReset,
    [serveStatusEndpoint.route]: handleServeStatus,
    [ownedNamespacesEndpoint.route]: handleOwnedNamespaces,
    [reclaimCompositionNamespaces.route]: handleReclaim,
  },
} satisfies ServerPluginDefinition;
