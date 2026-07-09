import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getVersion, listVersions, restoreVersion } from "../core/endpoints";
import { handleGetVersion } from "./internal/handle-get-version";
import { handleListVersions } from "./internal/handle-list-versions";
import { handleRestoreVersion } from "./internal/handle-restore-version";
import { entityVersionsRetention } from "./internal/retention";

export { defineHistorySource } from "./internal/registry";
export type { HistorySource } from "./internal/registry";
export { recordVersion, deleteVersions } from "./internal/record-version";

export default {
  description:
    "Domain-agnostic versioning substrate: the entity_versions table, a defineHistorySource registry, time-bucketed recordVersion + deleteVersions, and list/get/restore endpoints.",
  register: [entityVersionsRetention],
  httpRoutes: {
    [listVersions.route]: handleListVersions,
    [getVersion.route]: handleGetVersion,
    [restoreVersion.route]: handleRestoreVersion,
  },
} satisfies ServerPluginDefinition;
