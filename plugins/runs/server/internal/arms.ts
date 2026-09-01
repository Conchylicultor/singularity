import { and, sql, type SQL } from "drizzle-orm";
import type { ColumnExpr } from "@plugins/primitives/plugins/keyset/server";
import type { UnionArm } from "@plugins/primitives/plugins/data-view/plugins/union-query/server";
import type { RunArmFieldSpecs } from "../../core";
import type { RunKind } from "./registry";

/**
 * Wall-clock milliseconds, derived rather than stored.
 *
 * A run still in flight measures against `now()`, so "how long has this been
 * going" is the same column as "how long did this take" — one sortable
 * dimension across every kind, instead of a value that reads as nothing until
 * the run ends. Cast to `double precision` because `extract(epoch …)` yields
 * `numeric`, which `pg` decodes as a string.
 */
export function durationMsExpr(
  startedAt: ColumnExpr,
  finishedAt: ColumnExpr | null,
): SQL {
  const end =
    finishedAt === null ? sql`now()` : sql`coalesce(${finishedAt}, now())`;
  return sql`(extract(epoch from (${end} - ${startedAt})) * 1000)::double precision`;
}

/** The registered kinds as union arms, with the derived `duration` folded in. */
export function runArms(kinds: RunKind[]): UnionArm[] {
  return kinds.map((k) => ({
    kind: k.kind,
    table: k.table,
    base: {
      ...k.base,
      duration: durationMsExpr(k.base.startedAt, k.base.finishedAt),
    },
    extra: k.extra,
    where: k.where,
  }));
}

/**
 * The one arm that owns `kind`, narrowed to the single row `id` names.
 *
 * Built by narrowing what {@link runArms} already produced rather than by
 * assembling an arm here, so the derived `duration` cannot end up meaning one
 * thing on the list and another on a deep link.
 *
 * Three things about it are deliberate:
 *
 * - **An unknown kind is `[]`**, which `compileUnionPage` compiles into its
 *   empty-result scaffold. "There is no such kind" and "there is no such run"
 *   are the same answer to the caller's question, and neither is a failure —
 *   an arm can legitimately be out of the running composition.
 * - **The id predicate casts to text**, because `RUN_BASE_COLUMNS.id` DECLARES
 *   text and that declaration is what every other arm's NULL is cast to. An
 *   arm whose primary key happens to be a uuid or a bigint is still addressed
 *   by the text the union projects, so the comparison honours the base
 *   declaration rather than one arm's storage.
 * - **The arm's own `where` survives.** It is the arm's always-on scope (a
 *   soft-delete flag, a retention window, a namespace); dropping it here would
 *   let a deep link resolve a run the list refuses to show.
 */
export function runArmForRow(
  kinds: RunKind[],
  kind: string,
  id: string,
): UnionArm[] {
  const found = kinds.find((k) => k.kind === kind);
  if (!found) return [];
  return runArms([found]).map((arm) => ({
    ...arm,
    where: and(arm.where, sql`${found.base.id}::text = ${id}`),
  }));
}

/**
 * Every arm's extra columns, merged into the one spec map the compiler projects.
 *
 * Ids are namespaced by kind, so a collision means two arms claimed the same
 * `kind` prefix — a registration bug, and loud rather than a column one arm
 * silently loses.
 */
export function armFieldSpecs(kinds: RunKind[]): RunArmFieldSpecs {
  const merged: RunArmFieldSpecs = {};
  for (const k of kinds) {
    for (const [id, spec] of Object.entries(k.fields)) {
      if (id in merged) {
        throw new Error(
          `[runs] arm field "${id}" is declared by more than one run kind.`,
        );
      }
      merged[id] = spec;
    }
  }
  return merged;
}
