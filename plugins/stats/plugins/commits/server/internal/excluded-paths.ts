import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
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

export async function handleGetState(): Promise<Response> {
  const rows = await db.select().from(excludedPathState);
  const out: PathStateMap = {};
  for (const r of rows) out[r.path] = r.enabled;
  return Response.json(out);
}

export async function handlePatchState(req: Request): Promise<Response> {
  let body: { path?: string; enabled?: boolean };
  try {
    body = (await req.json()) as { path?: string; enabled?: boolean };
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!path) return Response.json({ error: "missing-path" }, { status: 400 });
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "missing-enabled" }, { status: 400 });
  }
  await db
    .insert(excludedPathState)
    .values({ path, enabled: body.enabled })
    .onConflictDoUpdate({
      target: excludedPathState.path,
      set: { enabled: body.enabled, updatedAt: new Date() },
    });
  excludedPathStateResource.notify();
  return Response.json({ ok: true, path, enabled: body.enabled });
}

export async function handleDeleteState(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const path = params.path;
  if (!path) return Response.json({ error: "missing-path" }, { status: 400 });
  await db.delete(excludedPathState).where(eq(excludedPathState.path, path));
  excludedPathStateResource.notify();
  return Response.json({ ok: true, path });
}
