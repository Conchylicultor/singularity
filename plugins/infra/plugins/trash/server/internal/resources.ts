import { desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { trashEntriesResource as descriptor } from "../../core/resources";
import type { TrashEntry } from "../../core/schemas";
import { _trashEntries } from "./tables";

// One source's trash entries, newest-deleted first — scoped by `sourceId`
// (mirrors `blocksLiveResource`'s per-param scoping). Push mode broadcasts the
// whole (small) array. DB-backed resources have no hand-`notify` — the L4
// change-feed on `trash_entries` pushes the recompute for EVERY write (record
// inside the domain's tx, restore, purge, TTL sweep, out-of-process alike).
export const trashEntriesLiveResource = defineResource(descriptor, {
  mode: "push",
  loader: async ({ sourceId }) =>
    db
      .select()
      .from(_trashEntries)
      .where(eq(_trashEntries.sourceId, sourceId))
      .orderBy(desc(_trashEntries.deletedAt)) as unknown as Promise<TrashEntry[]>,
});
