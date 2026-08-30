import { sql, type SQL } from "drizzle-orm";
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
