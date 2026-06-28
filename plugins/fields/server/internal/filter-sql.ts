import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { FieldType } from "@plugins/fields/core";
import { Fields as StorageFields } from "./storage";

/** Builds a SQL predicate fragment for one (field-type, operator) pair, or
 *  `undefined` when the operand is INCOMPLETE (no-op rule → dropped),
 *  reproducing each web predicate's "empty operand ⇒ keep all" rule. Operands
 *  must be bound as drizzle params (never interpolated) — no injection. */
export type FilterSqlBuilder = (
  col: AnyColumn,
  operand: unknown,
) => SQL | undefined;

export interface FieldFilterSqlContribution {
  type: FieldType;
  /** Operator id (matching the web `FilterOperatorSet`) → SQL fragment builder. */
  operators: Record<string, FilterSqlBuilder>;
}

/** Per-type operator→SQL registry, the server twin of `data-view.filter`'s
 *  operator predicates. Contribute `{ type, operators }`; keyed by type token. */
const FilterSql = defineServerContribution<FieldFilterSqlContribution>(
  "fields.filter-sql",
  { docLabel: (p) => p.type.id },
);

/** The `fields/server` capability namespace. `Storage` is composed in from
 *  `./storage` so the barrel re-exports ONE `Fields` object carrying every
 *  server-owned field capability (`Fields.Storage` + `Fields.FilterSql`) — the
 *  barrel itself stays pure (a plain re-export, no merge logic). */
export const Fields = { ...StorageFields, FilterSql };

// Eager, additive index of every field-type's operator map, populated directly
// from the type barrels. It is a fallback consulted AFTER the live registry, so
// it stays available in the windows where `collectContributions` has not run
// yet (mirrors the storage carve-out exactly).
let populated = false;
const eager = new Map<string, Record<string, FilterSqlBuilder>>();

/** Sync, idempotent. Pulls every field-type's operator map straight from its
 *  barrel so resolution never depends on the boot-time `collectContributions`
 *  pass. */
function ensureFieldFilterSqlPopulated(): void {
  if (populated) return;
  populated = true; // set first: a barrel that throws must not loop forever
  const here = dirname(fileURLToPath(import.meta.url)); // .../fields/server/internal
  const fieldsPlugins = resolve(here, "..", "..", "plugins"); // .../fields/plugins
  const req = createRequire(import.meta.url);
  // Generic discovery: */plugins/filter-sql/server/index.ts — a new field type's
  // filter-sql sub-plugin is picked up with zero edits here.
  for (const type of readdirSync(fieldsPlugins)) {
    const barrel = join(
      fieldsPlugins,
      type,
      "plugins",
      "filter-sql",
      "server",
      "index.ts",
    );
    let mod: {
      default?: {
        contributions?: {
          type?: { id: string };
          operators?: Record<string, FilterSqlBuilder>;
        }[];
      };
    };
    try {
      mod = req(barrel) as typeof mod;
    } catch (err) {
      // Expected: not every field type has a filter-sql sub-plugin, so the
      // barrel path may not resolve. Skip those; re-throw anything else (a real
      // barrel that fails to evaluate must surface loudly, not vanish).
      const code = (err as { code?: string } | null)?.code;
      if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
        continue;
      }
      throw err;
    }
    for (const c of mod.default?.contributions ?? []) {
      if (c?.type?.id && c.operators) eager.set(c.type.id, c.operators);
    }
  }
}

/** Resolve a (field type, operator) pair to its SQL fragment builder by exact
 *  token (no `extends` fallback — derived types re-declare). Live-first so a
 *  test that registers a throwaway type via `collectContributions` still wins;
 *  falls back to the eager barrel index for codegen / boot windows. */
export function resolveFieldFilterSql(
  typeId: string,
  operatorId: string,
): FilterSqlBuilder | undefined {
  ensureFieldFilterSqlPopulated();
  const live = Fields.FilterSql.getContributions().find(
    (c) => c.type.id === typeId,
  )?.operators;
  const operators = live ?? eager.get(typeId);
  return operators?.[operatorId];
}
