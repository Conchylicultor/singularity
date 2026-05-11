import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { triggerTableRegistry } from "./registry";
import { deleteTrigger } from "./trigger";
import {
  loadEmissions,
  loadTriggers,
  eventTriggersResource,
} from "./resources";

export async function handleListEmissions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
  const payload = await loadEmissions(limit);
  return Response.json(payload);
}

export async function handleListTriggers(): Promise<Response> {
  const payload = await loadTriggers();
  return Response.json(payload);
}

export async function handleDeleteTrigger(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteTrigger(id);
  eventTriggersResource.notify();
  return Response.json({ ok: true });
}

export async function handlePatchTrigger(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const body = (await req.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled (boolean) required" }, { status: 400 });
  }
  for (const table of triggerTableRegistry.values()) {
    await db
      // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable.
      .update(table as any)
      .set({ enabled: body.enabled })
      // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable.
      .where(eq((table as any).id as AnyPgColumn, id));
  }
  eventTriggersResource.notify();
  return Response.json({ ok: true });
}
