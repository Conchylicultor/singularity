import { desc, eq, isNull } from "drizzle-orm";
import { type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
import { db } from "@plugins/database/server";

export type RankExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Appends a new item after the current last row in a flat table.
export async function nextRankIn(
  table: PgTable & { rank: AnyPgColumn },
  executor: RankExecutor = db,
): Promise<Rank> {
  const [last] = await executor
    .select({ rank: table.rank })
    .from(table)
    .orderBy(desc(table.rank))
    .limit(1);
  const raw = (last as { rank: string } | undefined)?.rank ?? null;
  return Rank.between(raw !== null ? Rank.from(raw) : null, null);
}

// Appends a new item after the last sibling sharing the same parent value.
// The parent column is passed explicitly since it may be named anything
// (parentId, groupId, etc.) — not assumed to be "parentId".
export async function nextRankUnder(
  table: PgTable & { rank: AnyPgColumn },
  parentCol: AnyPgColumn,
  parentId: string | null,
  executor: RankExecutor = db,
): Promise<Rank> {
  const [last] = await executor
    .select({ rank: table.rank })
    .from(table)
    .where(parentId === null ? isNull(parentCol) : eq(parentCol, parentId))
    .orderBy(desc(table.rank))
    .limit(1);
  const raw = (last as { rank: string } | undefined)?.rank ?? null;
  return Rank.between(raw !== null ? Rank.from(raw) : null, null);
}
