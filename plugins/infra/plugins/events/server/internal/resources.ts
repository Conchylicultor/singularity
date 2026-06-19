import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { getAllRegisteredJobNames } from "@plugins/infra/plugins/jobs/server";
import {
  EmissionsPayloadSchema,
  TriggersPayloadSchema,
  type EmissionsPayload,
  type TriggersPayload,
} from "../../core/resources";
import { triggerTableRegistry } from "./registry";
import { _event_emissions } from "./tables";

const BASE_COLS = new Set(["id", "jobName", "jobWith", "enabled", "oneShot", "createdAt"]);

// biome-ignore lint/suspicious/noExplicitAny: dynamic row shape across per-event tables.
type Row = Record<string, any>;

export async function loadEmissions(limit = 200): Promise<EmissionsPayload> {
  const rows = await db
    .select()
    .from(_event_emissions)
    .orderBy(desc(_event_emissions.emittedAt))
    .limit(limit);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      eventName: r.eventName,
      payload: r.payload,
      matchedCount: r.matchedCount,
      matchedTriggerIds: r.matchedTriggerIds,
      emittedAt: r.emittedAt instanceof Date ? r.emittedAt.toISOString() : String(r.emittedAt),
    })),
  };
}

export async function loadTriggers(): Promise<TriggersPayload> {
  const out: TriggersPayload["rows"] = [];
  const registeredNames = getAllRegisteredJobNames();
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
        dangling: !registeredNames.has(r.jobName as string),
      });
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { rows: out };
}

export const eventEmissionsResource = defineResource({
  key: "event-emissions",
  mode: "invalidate",
  schema: EmissionsPayloadSchema,
  loader: async (): Promise<EmissionsPayload> => loadEmissions(200),
});

export const eventTriggersResource = defineResource({
  key: "event-triggers",
  mode: "invalidate",
  schema: TriggersPayloadSchema,
  loader: async (): Promise<TriggersPayload> => loadTriggers(),
});
