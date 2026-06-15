import { asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import type { StagedReorderDefault } from "../../shared/resources";
import { _reorderStagedDefault } from "./tables";
import { stagedReorderDefaultsResource } from "./resource";
import { landDefaults } from "./land";

function toStaged(r: {
  slotId: string;
  pluginId: string;
  items: unknown;
  authorId: string | null;
  updatedAt: Date;
}): StagedReorderDefault {
  return {
    slotId: r.slotId,
    pluginId: r.pluginId,
    items: r.items as unknown[],
    authorId: r.authorId,
    updatedAt: r.updatedAt,
  };
}

async function loadRows(slotIds?: string[]): Promise<StagedReorderDefault[]> {
  const base = db
    .select()
    .from(_reorderStagedDefault)
    .orderBy(asc(_reorderStagedDefault.slotId));
  const rows =
    slotIds && slotIds.length > 0
      ? await base.where(inArray(_reorderStagedDefault.slotId, slotIds))
      : await base;
  return rows.map(toStaged);
}

/**
 * Manual "Commit to main" landing job (non-blocking; enqueue-only — NO
 * `schedule`). Lands staged reorder defaults via a throwaway worktree off
 * `main` and drains the landed rows on success. `dedup: "singleton"` serializes
 * lands so only one push runs at a time.
 *
 * Enqueued by the Apply / Apply-all handlers: `{ slotIds: [id] }` for one slot,
 * `{}` (omitted) for every staged row.
 */
export const landDefaultsJob = defineJob({
  name: "reorder.land-defaults",
  input: z.object({
    slotIds: z.array(z.string()).optional(), // undefined/empty = all staged
  }),
  event: z.never(),
  dedup: "singleton",
  async run({ input }) {
    const rows = await loadRows(input.slotIds);
    if (rows.length === 0) return;
    // Drain only the slots that were actually written + pushed; malformed rows
    // are skipped by landDefaults and stay staged for the author to fix.
    const landed = await landDefaults(rows);
    if (landed.length === 0) return;
    await db
      .delete(_reorderStagedDefault)
      .where(inArray(_reorderStagedDefault.slotId, landed));
    stagedReorderDefaultsResource.notify();
  },
});
