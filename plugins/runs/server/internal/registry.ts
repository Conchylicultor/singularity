import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import type { ColumnExpr } from "@plugins/primitives/plugins/keyset/server";
import type {
  RunArmBaseColumnId,
  RunArmFieldSpecs,
  RunBaseColumnNullable,
} from "../../core";

/**
 * Where an arm's base columns come from — one key per base column `runs`
 * declared, **derived from that declaration** rather than restated.
 *
 * Two things follow, and both are the point of the plugin:
 *
 * - Every key is REQUIRED. An arm that forgets `outcome` does not get a silently
 *   NULL column that renders as a blank chip forever; it fails `tsc`.
 * - A key is `ColumnExpr | null` exactly when the base declaration says the
 *   column is nullable. So `namespace: null` ("a backup is host-global") is
 *   spellable and `startedAt: null` is not.
 *
 * `duration` is absent on purpose: it is derived from `startedAt` / `finishedAt`,
 * so no arm can supply one and no two arms can disagree about what a duration is.
 */
export type RunArmBaseColumns = {
  [K in RunArmBaseColumnId]: RunBaseColumnNullable[K] extends true
    ? ColumnExpr | null
    : ColumnExpr;
};

/**
 * What a domain hands `defineRunKind`.
 *
 * `extra` is keyed against `fields` — the arm's own declaration in its `core/` —
 * so a declared field with no column, or a column with no declared field, is a
 * `tsc` error. That is the same key set the web side binds its `FieldDef.id`s
 * to, which is what stops a web field id from drifting off the server column it
 * is supposed to filter through.
 */
export interface RunKindSpec<S extends RunArmFieldSpecs = RunArmFieldSpecs> {
  /** The discriminator value. Must match the `defineRunArmFields` prefix. */
  kind: string;
  /** The domain's own ledger table. Stays plugin-private; only bound here. */
  table: PgTable;
  /** This arm's extra-column declaration, from the arm's `core/`. */
  fields: S;
  base: RunArmBaseColumns;
  extra: { [K in keyof S]: ColumnExpr };
  /** Always-on scope for this arm — a soft-delete flag, a retention window. */
  where?: SQL;
}

/**
 * A registered arm, as the query compiler and the revision tick read it.
 *
 * There is deliberately **no `label`** here. The kind's human name is a web
 * concern — the filter chip's options must list every registered kind, not the
 * ones that happen to be on the loaded page — so it is declared once, on
 * `Runs.Kind`. A second copy on the server would be written by every arm and
 * read by nothing, and two labels for one kind can disagree.
 */
export interface RunKind {
  kind: string;
  table: PgTable;
  fields: RunArmFieldSpecs;
  base: RunArmBaseColumns;
  extra: Record<string, ColumnExpr>;
  where?: SQL;
}

// Module-load-time registry. Populated by `defineRunKind`'s `register()` during
// the framework's register phase (mirrors `defineTrashSource` /
// `defineHistorySource`). Insertion order is the order the arms appear in the
// UNION, which is the order they were loaded — irrelevant to the result, since
// the outer ORDER BY is total.
const runKindRegistry = new Map<string, RunKind>();

/**
 * Register a run kind — one arm of the merged run space.
 *
 * Returns a {@link Registration}: a lazy registry write the framework applies
 * when the token sits in a plugin's `register: [...]` array. `runs` never names
 * an arm and an arm never edits `runs`; adding a kind is one folder.
 */
export function defineRunKind<const S extends RunArmFieldSpecs>(
  spec: RunKindSpec<S>,
): RunKind & Registration {
  const kind: RunKind = {
    kind: spec.kind,
    table: spec.table,
    fields: spec.fields,
    base: spec.base,
    extra: spec.extra as Record<string, ColumnExpr>,
    where: spec.where,
  };
  return {
    ...kind,
    _kind: "run-kind",
    _factory: "defineRunKind",
    _doc: { label: spec.kind },
    register() {
      if (runKindRegistry.has(spec.kind)) {
        throw new Error(`[runs] duplicate run kind: ${spec.kind}`);
      }
      // The prefix rule is enforced at declaration time by `defineRunArmFields`;
      // re-stated here because `fields` is structurally typed and a hand-rolled
      // object literal would otherwise slip past it.
      const prefix = `${spec.kind}.`;
      for (const id of Object.keys(spec.fields)) {
        if (!id.startsWith(prefix)) {
          throw new Error(
            `[runs] arm field "${id}" of kind "${spec.kind}" must be namespaced "${prefix}<id>".`,
          );
        }
        for (const [otherKind, other] of runKindRegistry) {
          if (id in other.fields) {
            throw new Error(
              `[runs] arm field "${id}" is already declared by kind "${otherKind}".`,
            );
          }
        }
      }
      runKindRegistry.set(spec.kind, kind);
    },
  };
}

/** Every registered arm, in load order. */
export function getRunKinds(): RunKind[] {
  return [...runKindRegistry.values()];
}
