import { MdSort } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";
import { textFieldType } from "@plugins/fields/plugins/text/core";

// The `rank` field type — a string column backed by the `rank_text` Postgres
// domain (TEXT COLLATE "C") instead of plain `text`, so fractional-indexing
// keys sort by byte order (uppercase before lowercase), which locale-aware
// collation breaks. Its DB column mapping (`rankText(name)`) lives in the
// `plugins/storage` sub-plugin; the `rankField()` factory in `plugins/config`.
//
// The value type is `string` (the raw rank key), keeping `table.$inferSelect`
// honest. The `Rank` value-object transform (sort/compare/between) is a
// wire-schema concern a consumer layers on with `@plugins/primitives/rank`'s
// `RankSchema`, never baked into the column.
export const rankFieldType = defineFieldType<string>("rank");

export const rankIdentity = defineFieldIdentity<string>({
  type: rankFieldType,
  label: "Rank",
  icon: MdSort,
  extends: textFieldType,
});
