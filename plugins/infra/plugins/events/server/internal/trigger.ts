import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { JobFactory } from "@plugins/infra/plugins/jobs/server";
import { db } from "@server/db/client";
import type { EventSource } from "./event";
import { triggerTableRegistry } from "./registry";

export interface TriggerSpec<P, I> {
  on: EventSource<P>;
  do: JobFactory<string, z.ZodType<I>>;
  /**
   * Static fields baked into the trigger row that the event payload does not
   * supply. Merged with `eventPayload` at dispatch time (event payload wins
   * on key overlap) to form the target job's input.
   */
  with?: Partial<I>;
  oneShot?: boolean;
}

// Persist a subscription. Inserts one row into the event's per-type table
// with the filter values, job name, and serialized `with` config.
export async function trigger<P, I>(spec: TriggerSpec<P, I>): Promise<string> {
  return insertTriggerRow({
    on: spec.on,
    jobName: spec.do.name,
    with: spec.with as Record<string, unknown> | undefined,
    oneShot: spec.oneShot,
  });
}

export interface TriggerByNameSpec<P> {
  on: EventSource<P>;
  /**
   * Target job, identified by registered name. Used by infrastructure code
   * (e.g. the @plugins/jobs durable-hook bridge) that can't hold a typed
   * `JobFactory` reference back to its own builtin without closing the
   * plugin DAG. Plugin authors should prefer `trigger()` — passing the
   * typed factory keeps `with` linked to the target's input schema.
   */
  jobName: string;
  with?: Record<string, unknown>;
  oneShot?: boolean;
}

// Same row-insert as `trigger()`, but typed for callers that only carry a
// job name. Skips the JobFactory typing — `with` is therefore unconstrained.
export async function triggerByName<P>(
  spec: TriggerByNameSpec<P>,
): Promise<string> {
  return insertTriggerRow(spec);
}

interface RowInsertSpec<P> {
  on: EventSource<P>;
  jobName: string;
  with?: Record<string, unknown>;
  oneShot?: boolean;
}

async function insertTriggerRow<P>(spec: RowInsertSpec<P>): Promise<string> {
  if (spec.on.__kind !== "event") {
    throw new Error(
      `[events] trigger({ on }) got unsupported source kind: ${(spec.on as { __kind: string }).__kind}`,
    );
  }

  const { def, filter } = spec.on;
  const oneShot = spec.oneShot ?? true;

  const values: Record<string, unknown> = {
    jobName: spec.jobName,
    jobWith: spec.with ?? {},
    oneShot,
  };
  for (const key of Object.keys(def.filterColumns)) {
    values[key] = filter[key] ?? null;
  }

  const rows = await db
    .insert(def.table)
    .values(values)
    .returning({
      // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access on untyped PgTable.
      id: (def.table as any).id as AnyPgColumn,
    });

  const row = rows[0];
  if (!row) throw new Error(`[events] trigger insert returned no rows`);
  return row.id as string;
}

// Delete a trigger row by id. UUIDs are globally unique so we sweep every
// registered trigger table; the first match deletes, the rest are no-ops.
export async function deleteTrigger(id: string): Promise<void> {
  for (const table of triggerTableRegistry.values()) {
    await db
      .delete(table)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access on untyped PgTable.
      .where(eq((table as any).id as AnyPgColumn, id));
  }
}

// Sweep every trigger table, deleting rows whose target job matches and whose
// persisted `jobWith` contains every key in `configMatch` (JSONB `@>`). Omit
// `configMatch` to remove every trigger that binds this job.
export async function deleteTriggersFor<
  N extends string,
  S extends z.ZodType,
>(
  job: JobFactory<N, S>,
  configMatch?: Partial<z.input<S>>,
): Promise<void> {
  const matchJson =
    configMatch && Object.keys(configMatch).length > 0
      ? JSON.stringify(configMatch)
      : null;
  for (const table of triggerTableRegistry.values()) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on base-columns.
    const jobNameCol = (table as any).jobName as AnyPgColumn;
    if (matchJson) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on base-columns.
      const jobWithCol = (table as any).jobWith as AnyPgColumn;
      await db
        .delete(table)
        .where(
          and(
            eq(jobNameCol, job.name),
            sql`${jobWithCol} @> ${matchJson}::jsonb`,
          ),
        );
    } else {
      await db.delete(table).where(eq(jobNameCol, job.name));
    }
  }
}
