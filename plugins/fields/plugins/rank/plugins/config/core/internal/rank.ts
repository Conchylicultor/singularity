import { z } from "zod";
import { type FieldDef, type FieldMeta, pickMeta } from "@plugins/fields/core";
import { rankFieldType } from "@plugins/fields/plugins/rank/core";

export interface RankFieldDef extends FieldDef<string> {
  readonly type: typeof rankFieldType;
}

// Builds a `rank` field record entry. The schema is a bare `z.string()` (the raw
// fractional-indexing key) — the `Rank` value-object transform stays a
// wire-schema concern, so the column's `$inferSelect` type remains `string`.
// The column is non-nullable with no DB default (a rank is always computed on
// insert via `nextRankIn` / `nextRankUnder` / `Rank.between`).
export function rankField(opts?: FieldMeta & { default?: string }): RankFieldDef {
  return Object.freeze({
    type: rankFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: pickMeta(opts),
  });
}
