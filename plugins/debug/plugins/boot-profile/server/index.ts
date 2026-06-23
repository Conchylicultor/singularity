import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  saveBootTrace,
  getSavedBootTrace,
  listBootTraces,
} from "../shared/endpoints";
import {
  handleSaveBootTrace,
  handleGetSavedBootTrace,
  handleListBootTraces,
} from "./internal/handlers";
import { bootTraceCleanupJob } from "./internal/cleanup-job";

export { _bootTraces } from "./internal/tables";

export default {
  description:
    "Persists captured browser boot traces under a unique id (POST), serves one snapshot (GET) and a metadata-only list (GET) for the permalink + browse panes, and sweeps snapshots older than 30 days via a scheduled job.",
  httpRoutes: {
    [saveBootTrace.route]: handleSaveBootTrace,
    [getSavedBootTrace.route]: handleGetSavedBootTrace,
    [listBootTraces.route]: handleListBootTraces,
  },
  register: [bootTraceCleanupJob],
} satisfies ServerPluginDefinition;
