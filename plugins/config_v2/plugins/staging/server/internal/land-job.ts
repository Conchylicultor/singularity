import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import type { StagedConfigDefault } from "../../shared/resources";
import { _stagedConfigDefault } from "./tables";
import { stagedConfigDefaultsResource } from "./resource";
import { landDefaults, type LandedKey } from "./land";

function toStaged(r: {
  pluginId: string;
  configName: string;
  value: unknown;
  authorId: string | null;
  updatedAt: Date;
}): StagedConfigDefault {
  return {
    pluginId: r.pluginId,
    configName: r.configName,
    value: r.value,
    authorId: r.authorId,
    updatedAt: r.updatedAt,
  };
}

// Build an OR-of-ANDs predicate matching a set of composite keys, or undefined
// when no keys are given (→ "all rows").
function keysPredicate(keys: LandedKey[]) {
  if (keys.length === 0) return undefined;
  return or(
    ...keys.map((k) =>
      and(
        eq(_stagedConfigDefault.pluginId, k.pluginId),
        eq(_stagedConfigDefault.configName, k.configName),
      ),
    ),
  );
}

async function loadRows(keys?: LandedKey[]): Promise<StagedConfigDefault[]> {
  const predicate = keys ? keysPredicate(keys) : undefined;
  const base = db
    .select()
    .from(_stagedConfigDefault)
    .orderBy(asc(_stagedConfigDefault.pluginId), asc(_stagedConfigDefault.configName));
  const rows = predicate ? await base.where(predicate) : await base;
  return rows.map(toStaged);
}

/**
 * Manual "Commit to main" landing job (non-blocking; enqueue-only — NO
 * `schedule`). Lands staged config defaults via a throwaway worktree off `main`
 * and drains the landed rows on success. `dedup: "singleton"` serializes lands
 * so only one push runs at a time.
 *
 * Enqueued by the Apply / Apply-all handlers: `{ keys: [{pluginId, configName}] }`
 * for one descriptor, `{}` (omitted) for every staged row.
 */
export const landDefaultsJob = defineJob({
  name: "config-v2.land-defaults",
  input: z.object({
    keys: z
      .array(z.object({ pluginId: z.string(), configName: z.string() }))
      .optional(), // undefined/empty = all staged
  }),
  event: z.never(),
  dedup: "singleton",
  async run({ input }) {
    const rows = await loadRows(input.keys);
    if (rows.length === 0) return;
    // Drain only the keys that were actually written + pushed; skipped rows
    // (malformed / non-promotable) stay staged for the author to fix.
    const landed = await landDefaults(rows);
    if (landed.length === 0) return;
    const predicate = keysPredicate(landed);
    if (predicate) {
      await db.delete(_stagedConfigDefault).where(predicate);
    }
    stagedConfigDefaultsResource.notify();
  },
});
