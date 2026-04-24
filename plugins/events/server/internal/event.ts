import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  type PgColumnBuilderBase,
  type PgTable,
  pgTable,
} from "drizzle-orm/pg-core";
import { db } from "@server/db/client";
import { eventTriggerColumns } from "./base-columns";
import { triggerTableRegistry } from "./registry";
import { DEFAULT_MAX_ATTEMPTS, DISPATCH_TASK, getWorkerUtils } from "./worker";

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

  if (rows.length === 0) return;

  // Enqueue one durable Graphile job per matching row. Execution (including
  // retries, oneShot deletes, and preservation on permanent failure) happens
  // in the worker — see `./worker.ts`. emit() resolves once jobs are durable
  // in `graphile_worker.jobs`, not when handlers finish.
  const utils = await getWorkerUtils();
  await Promise.all(
    rows.map((row) =>
      // biome-ignore lint/suspicious/noExplicitAny: row shape is dynamic per table.
      utils.addJob(DISPATCH_TASK, {
        actionName: (row as any).actionName,
        actionConfig: (row as any).actionConfig,
        eventPayload: payload,
        triggerId: (row as any).id,
        eventName: def.name,
        oneShot: (row as any).oneShot,
      }, { maxAttempts: DEFAULT_MAX_ATTEMPTS }),
    ),
  );
}
