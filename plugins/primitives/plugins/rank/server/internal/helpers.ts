import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";

export type RankExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const parentFilter = (parentCol: AnyPgColumn, parentId: string | null) =>
  parentId === null ? isNull(parentCol) : eq(parentCol, parentId);

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
    .where(parentFilter(parentCol, parentId))
    .orderBy(desc(table.rank))
    .limit(1);
  const raw = (last as { rank: string } | undefined)?.rank ?? null;
  return Rank.between(raw !== null ? Rank.from(raw) : null, null);
}

// Inserts a new item immediately after `afterId` among the rows sharing the same
// parent value — the positional twin of `nextRankUnder` (which appends at the end).
// `afterId === null` prepends at the START of the sibling list.
//
// WHY this lives on the server: rank arithmetic is only valid over the COMPLETE
// sibling set. A client typically holds a filtered projection of a shared
// ordering space (a search-filtered tree, a status-filtered list), so a rank it
// mints between two *visible* neighbours can collide with an invisible row that
// sits between them. The client must therefore send positional intent — an
// anchor id — and never a rank; only the server can read the true next
// neighbour and interpolate against it.
//
// A bad anchor is a caller bug, so it throws rather than falling back to an
// append: a silently-appended row is exactly the class of failure this API
// exists to prevent.
export async function rankAfterSibling(
  table: PgTable & { rank: AnyPgColumn },
  parentCol: AnyPgColumn,
  parentId: string | null,
  afterId: string | null,
  idCol: AnyPgColumn,
  executor: RankExecutor = db,
): Promise<Rank> {
  const siblings = parentFilter(parentCol, parentId);

  if (afterId === null) {
    const [first] = await executor
      .select({ rank: table.rank })
      .from(table)
      .where(siblings)
      .orderBy(asc(table.rank))
      .limit(1);
    const raw = (first as { rank: string } | undefined)?.rank ?? null;
    return Rank.between(null, raw !== null ? Rank.from(raw) : null);
  }

  const [anchor] = await executor
    .select({ rank: table.rank })
    .from(table)
    .where(and(siblings, eq(idCol, afterId)))
    .limit(1);
  const anchorRaw = (anchor as { rank: string } | undefined)?.rank ?? null;
  if (anchorRaw === null) {
    throw new Error(
      `rankAfterSibling: anchor "${afterId}" is not a row under parent ${
        parentId === null ? "<root>" : `"${parentId}"`
      }`,
    );
  }
  const anchorRank = Rank.from(anchorRaw);

  // The true next neighbour over the complete sibling set — not over whatever
  // subset the caller happens to be rendering.
  const [next] = await executor
    .select({ rank: table.rank })
    .from(table)
    .where(and(siblings, gt(table.rank, anchorRaw)))
    .orderBy(asc(table.rank))
    .limit(1);
  const nextRaw = (next as { rank: string } | undefined)?.rank ?? null;

  return Rank.between(anchorRank, nextRaw !== null ? Rank.from(nextRaw) : null);
}
