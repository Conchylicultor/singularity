import { boardParamsFor, type MetricQuery, type Preset } from "../../core";

/** Where a board is looked at from: its range and its tab-level params. */
export interface BoardContext {
  preset: Preset;
  /** The board's `<source>.<param>` values. */
  params: Readonly<Record<string, unknown>>;
}

/** Buckets fall at the viewer's own midnights. */
function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The query for one metric of a board. `split` null asks for the
 * unsplit total WITH its previous period — the tile and the unsplit card share
 * this one query (and so one fetch); whether the card draws the previous line
 * is a display choice, not a second question.
 */
export function boardQuery(
  entry: QueryEntry,
  ctx: BoardContext,
  split: string | null,
): MetricQuery {
  const base = queryBase(entry, ctx);
  return split === null ? { ...base, compare: true } : { ...base, split };
}

/** A breakdown's query: the whole range, never split, no previous period. */
export function breakdownQuery(
  entry: QueryEntry,
  ctx: BoardContext,
): MetricQuery {
  return { ...queryBase(entry, ctx), compare: false };
}

type QueryEntry = { id: string; source: string; params: readonly string[] };

function queryBase(entry: QueryEntry, ctx: BoardContext) {
  return {
    metric: entry.id,
    range: { preset: ctx.preset },
    tz: viewerTimeZone(),
    params: boardParamsFor(ctx.params, entry),
  };
}
