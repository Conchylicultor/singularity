import { desc, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { triggerTableRegistry } from "./registry";
import { _event_emissions } from "./tables";
import { deleteTrigger } from "./trigger";

const BASE_COLS = new Set([
  "id",
  "jobName",
  "jobWith",
  "enabled",
  "oneShot",
  "createdAt",
]);

// Keys of the trigger base columns, widened to `any` row access below.
// biome-ignore lint/suspicious/noExplicitAny: dynamic row shape across per-event tables.
type Row = Record<string, any>;

export async function handleListEmissions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
  const rows = await db
    .select()
    .from(_event_emissions)
    .orderBy(desc(_event_emissions.emittedAt))
    .limit(limit);
  return Response.json({ rows });
}

export async function handleListTriggers(): Promise<Response> {
  // Walk every registered event table and flatten rows into a single list.
  // Filter columns vary per event — split them out from the base columns so
  // the UI can render them as "filters" chips without hardcoding event names.
  const out: {
    eventName: string;
    id: string;
    jobName: string;
    jobWith: Record<string, unknown>;
    enabled: boolean;
    oneShot: boolean;
    createdAt: string;
    filters: Record<string, unknown>;
  }[] = [];
  for (const [eventName, table] of triggerTableRegistry.entries()) {
    const rows = (await db.select().from(table)) as Row[];
    for (const r of rows) {
      const filters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!BASE_COLS.has(k)) filters[k] = v;
      }
      out.push({
        eventName,
        id: r.id as string,
        jobName: r.jobName as string,
        jobWith: (r.jobWith ?? {}) as Record<string, unknown>,
        enabled: r.enabled as boolean,
        oneShot: r.oneShot as boolean,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        filters,
      });
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Response.json({ rows: out });
}

export async function handleDeleteTrigger(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteTrigger(id);
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
  // UUIDs are globally unique; sweep every table, matching row (if any) is updated.
  for (const table of triggerTableRegistry.values()) {
    await db
      // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable.
      .update(table as any)
      .set({ enabled: body.enabled })
      // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable.
      .where(eq((table as any).id as AnyPgColumn, id));
  }
  return Response.json({ ok: true });
}
