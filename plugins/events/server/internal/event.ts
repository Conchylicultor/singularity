import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  type PgColumnBuilderBase,
  type PgTable,
  pgTable,
} from "drizzle-orm/pg-core";
import { DEFAULT_MAX_ATTEMPTS, UNSAFE_getRegisteredJob } from "@plugins/jobs/server";
import { db } from "@server/db/client";
import { eventTriggerColumns } from "./base-columns";
import { eventsDispatchJob } from "./dispatch-job";
import { triggerTableRegistry } from "./registry";
import { _event_emissions, EMISSIONS_CAP } from "./tables";

// A filter slot is either a plain column builder (identity-or-null match on
// the same-named payload key) or an object with an explicit match predicate.
export type FilterSlot<T> =
  | PgColumnBuilderBase
  | { column: PgColumnBuilderBase; match: (col: AnyPgColumn, payload: T) => SQL };

export interface DefineTriggerEventSpec<
  T extends Record<string, unknown>,
  F extends Record<string, FilterSlot<T>>,
> {
  name: string;
  filters: F;
  matchFn?: (table: PgTable, payload: T) => SQL;
}

// Normalized per-event definition held in-memory. `trigger`, `emit`, and
// `.where` all close over one of these.
interface EventDef<T> {
  name: string;
  table: PgTable;
  filterColumns: Record<string, AnyPgColumn>;
  filterMatchers: Record<string, (col: AnyPgColumn, payload: T) => SQL>;
  matchFn?: (table: PgTable, payload: T) => SQL;
}

export interface EventSource<T = unknown> {
  readonly __kind: "event";
  readonly def: EventDef<T>;
  readonly filter: Record<string, unknown>;
}

// The event handle returned from `defineTriggerEvent`. It IS a match-any
// Source and additionally exposes `.emit` (owner-only) and `.where` (subscriber).
export type EventHandle<T, F extends Record<string, unknown>> = EventSource<T> & {
  readonly name: string;
  emit(payload: T): Promise<void>;
  where(filter: Partial<{ [K in keyof F & keyof T]: T[K] }>): EventSource<T>;
};

function isObjectSlot<T>(
  v: FilterSlot<T>,
): v is { column: PgColumnBuilderBase; match: (col: AnyPgColumn, payload: T) => SQL } {
  return (
    typeof v === "object" &&
    v !== null &&
    "match" in v &&
    // biome-ignore lint/suspicious/noExplicitAny: runtime brand check.
    typeof (v as any).match === "function"
  );
}

export function defineTriggerEvent<
  T extends Record<string, unknown>,
  F extends Record<string, FilterSlot<T>> = Record<string, FilterSlot<T>>,
>(spec: DefineTriggerEventSpec<T, F>): {
  table: PgTable;
  event: EventHandle<T, F>;
} {
  const tableName = spec.name.replace(/\./g, "_") + "_triggers";

  const columnBuilders: Record<string, PgColumnBuilderBase> = {};
  const matcherBuilders: Record<
    string,
    (col: AnyPgColumn, payload: T) => SQL
  > = {};

  for (const key of Object.keys(spec.filters)) {
    const slot = spec.filters[key as keyof F] as FilterSlot<T>;
    if (isObjectSlot(slot)) {
      columnBuilders[key] = slot.column;
      matcherBuilders[key] = slot.match;
    } else {
      columnBuilders[key] = slot;
      matcherBuilders[key] = (col, payload) =>
        // biome-ignore lint/style/noNonNullAssertion: or() with 2 args never returns undefined.
        or(isNull(col), eq(col, (payload as Record<string, unknown>)[key]))!;
    }
  }

  const table = pgTable(
    tableName,
    {
      ...eventTriggerColumns(),
      ...columnBuilders,
    },
    (t) =>
      Object.keys(columnBuilders).map((key) =>
        index(`${tableName}_${key}_idx`)
          // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped Record.
          .on((t as any)[key])
          .where(sql`enabled`),
      ),
  );

  // Resolve column references on the built table.
  const resolvedCols: Record<string, AnyPgColumn> = {};
  for (const key of Object.keys(columnBuilders)) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable.
    resolvedCols[key] = (table as any)[key] as AnyPgColumn;
  }

  const def: EventDef<T> = {
    name: spec.name,
    table,
    filterColumns: resolvedCols,
    filterMatchers: matcherBuilders,
    matchFn: spec.matchFn,
  };

  if (triggerTableRegistry.has(spec.name)) {
    throw new Error(`[events] duplicate event name: ${spec.name}`);
  }
  triggerTableRegistry.set(spec.name, table);

  const event: EventHandle<T, F> = Object.assign(
    {
      __kind: "event" as const,
      def,
      filter: {} as Record<string, unknown>,
    },
    {
      name: spec.name,
      emit: async (payload: T) => {
        await dispatch(def, payload);
      },
      where: (filter: Partial<{ [K in keyof F & keyof T]: T[K] }>) => ({
        __kind: "event" as const,
        def,
        filter: filter as Record<string, unknown>,
      }),
    },
  );

  return { table, event };
}

// ─── Dispatch ────────────────────────────────────────────────────────────

async function dispatch<T>(def: EventDef<T>, payload: T): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: base-column property access on PgTable.
  const enabledCol = (def.table as any).enabled as AnyPgColumn;
  const predicates: SQL[] = [eq(enabledCol, true)];

  if (def.matchFn) {
    predicates.push(def.matchFn(def.table, payload));
  } else {
    for (const key of Object.keys(def.filterColumns)) {
      const col = def.filterColumns[key]!;
      const matcher = def.filterMatchers[key]!;
      predicates.push(matcher(col, payload));
    }
  }

  const rows = await db
    .select()
    .from(def.table)
    .where(and(...predicates));

  // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
  const matchedIds = rows.map((r) => (r as any).id as string);
  await recordEmission(def.name, payload, matchedIds);

  if (rows.length === 0) return;

  // Enqueue one events-dispatch job per matching row. Execution (including
  // retries, oneShot deletes, and preservation on permanent failure) happens
  // inside the dispatch job — see `./dispatch-job.ts`. emit() resolves once
  // jobs are durable in `graphile_worker.jobs`, not when handlers finish.
  //
  // maxAttempts is threaded from the target job's definition so the wrapper
  // dispatch job inherits the target's retry budget — otherwise every
  // event-triggered call would get the Layer-1 default regardless of what
  // `defineJob({ maxAttempts })` declared. Unknown target → fall through to
  // DEFAULT_MAX_ATTEMPTS; the dispatcher's preservation branch returns
  // without throwing, so retries never actually run in that case.
  await Promise.all(
    rows.map((row) => {
      // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
      const jobName = (row as any).jobName as string;
      const target = UNSAFE_getRegisteredJob(jobName);
      return eventsDispatchJob.enqueue(
        {
          eventName: def.name,
          // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
          triggerId: (row as any).id as string,
          jobName,
          // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
          jobWith: ((row as any).jobWith ?? {}) as Record<string, unknown>,
          eventPayload: (payload ?? {}) as Record<string, unknown>,
          // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
          oneShot: (row as any).oneShot as boolean,
        },
        { maxAttempts: target?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS },
      );
    }),
  );
}

// Append to the emission log and trim back to the cap. Runs inside dispatch()
// before jobs are enqueued so the log reflects "what fired" even when the
// matched triggers are zero (the most interesting debug case).
async function recordEmission(
  eventName: string,
  payload: unknown,
  matchedTriggerIds: string[],
): Promise<void> {
  await db.insert(_event_emissions).values({
    eventName,
    payload: (payload ?? {}) as Record<string, unknown>,
    matchedCount: matchedTriggerIds.length,
    matchedTriggerIds,
  });
  // Cap at EMISSIONS_CAP rows — cheap single DELETE instead of a window.
  await db.execute(
    sql`DELETE FROM ${_event_emissions}
        WHERE ${_event_emissions.id} IN (
          SELECT id FROM ${_event_emissions}
          ORDER BY ${_event_emissions.emittedAt} DESC
          OFFSET ${EMISSIONS_CAP}
        )`,
  );
}
