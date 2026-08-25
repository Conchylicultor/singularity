import { text } from "drizzle-orm/pg-core";
import { ZodString } from "zod";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

/**
 * The `text` column, narrowed by whatever the FIELD's own schema says.
 *
 * `enumTextField(...)` is the field-record analogue of `text("x").$type<Union>()`
 * — and `$type` runs nothing, so the union was a claim about rows nobody
 * checked. Handing the schema to `parsedText` makes the claim true: it is what
 * decodes the column, on every read and every write.
 *
 * The branch is on the schema the author actually wrote, not a heuristic about
 * intent — so a plain `textField()` keeps a plain `text` column and pays
 * nothing, which matters because decoding a column that is NOT narrowed costs
 * the same as decoding one that is (345 ns vs 322 ns per value) for zero
 * guarantee. See `research/2026-08-25-global-decoded-entity-columns.md`.
 */
export const decode = <V extends string>(
  name: string,
  valueSchema: ZodParser<V>,
): StorageColumnFor<V> =>
  valueSchema instanceof ZodString
    ? // `z.string()` — the column already holds exactly this, so a decoder here
      // would verify nothing at 345 ns/value.
      widestTextColumn<V>(name)
    : parsedText(name, valueSchema);

/**
 * The plain `text` column, for the branch where the schema does not narrow it.
 *
 * The cast is SOUND, not a hope: `ZodString`'s output type IS `string`, and
 * `string` is not assignable to any proper subtype of itself, so a
 * `ZodParser<V>` for a narrower `V` can never actually BE a `ZodString`. Passing
 * the `instanceof` therefore proves `V` is `string`. TypeScript cannot narrow a
 * type parameter from an `instanceof`, so the equality is stated here — once,
 * with its proof — rather than at the branch.
 */
const widestTextColumn = <V extends string>(
  name: string,
): StorageColumnFor<V> => text(name) as unknown as StorageColumnFor<V>;
