import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { listTrash, restoreTrash, purgeTrash } from "../core/endpoints";
import { handleListTrash } from "./internal/handle-list-trash";
import { handleRestoreTrash } from "./internal/handle-restore-trash";
import { handlePurgeTrash } from "./internal/handle-purge-trash";
import { trashEntriesLiveResource } from "./internal/resources";
import { trashPurge } from "./internal/purge";

export { defineTrashSource, getTrashSource } from "./internal/registry";
export type { TrashSource } from "./internal/registry";
export { recordTrashEntry } from "./internal/record-entry";
export type { TrashExecutor } from "./internal/record-entry";
export { _trashEntries } from "./internal/tables";

export default {
  description:
    "Generic trash primitive: the trash_entries operation ledger, a defineTrashSource registry, list/restore/purge endpoints, the per-source trash live resource, and the 30-day purge sweep — so user content is soft-deleted (restorable) instead of hard-deleted, and FK cascades fire only at purge.",
  register: [trashPurge],
  httpRoutes: {
    [listTrash.route]: handleListTrash,
    [restoreTrash.route]: handleRestoreTrash,
    [purgeTrash.route]: handlePurgeTrash,
  },
  contributions: [Resource.Declare(trashEntriesLiveResource)],
} satisfies ServerPluginDefinition;
