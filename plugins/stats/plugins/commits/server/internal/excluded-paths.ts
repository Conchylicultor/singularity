import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  getExcludedPathState,
  patchExcludedPathState,
  deleteExcludedPathState,
} from "../../shared/endpoints";
import { excludedPathState } from "./tables";

export type PathStateMap = z.infer<typeof PathStateMapSchema>;
export const PathStateMapSchema = z.record(z.boolean());

export const excludedPathStateResource = defineResource<PathStateMap>({
  key: "stats-commits.excluded-path-state",
  mode: "push",
  schema: PathStateMapSchema,
  async loader() {
    const rows = await db.select().from(excludedPathState);
    const out: PathStateMap = {};
    for (const r of rows) out[r.path] = r.enabled;
    return out;
  },
});

/** Return the subset of `excludedPaths` that are currently enabled (overrides default true). */
export async function activeExcludedPaths(excludedPaths: string[]): Promise<string[]> {
  if (excludedPaths.length === 0) return [];
  const rows = await db.select().from(excludedPathState);
  const overrides = new Map<string, boolean>();
  for (const r of rows) overrides.set(r.path, r.enabled);
  return excludedPaths.filter((p) => overrides.get(p) ?? true);
}

export const handleGetState = implement(getExcludedPathState, async () => {
  const rows = await db.select().from(excludedPathState);
  const out: PathStateMap = {};
  for (const r of rows) out[r.path] = r.enabled;
  return out;
});

export const handlePatchState = implement(patchExcludedPathState, async ({ body }) => {
  const path = body.path.trim();
  if (!path) throw new HttpError(400, "missing-path");
  await db
    .insert(excludedPathState)
    .values({ path, enabled: body.enabled })
    .onConflictDoUpdate({
      target: excludedPathState.path,
      set: { enabled: body.enabled, updatedAt: new Date() },
    });
  excludedPathStateResource.notify();
  return { ok: true, path, enabled: body.enabled };
});

export const handleDeleteState = implement(deleteExcludedPathState, async ({ params }) => {
  const { path } = params;
  if (!path) throw new HttpError(400, "missing-path");
  await db.delete(excludedPathState).where(eq(excludedPathState.path, path));
  excludedPathStateResource.notify();
  return { ok: true, path };
});
