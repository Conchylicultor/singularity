import { jsonb } from "drizzle-orm/pg-core";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * **The one storage contribution in the repo that ASSERTS rather than derives.**
 * Do not read this file as the pattern: the other eight either take their type
 * from the column drizzle really builds, or decode it with the field's own
 * schema. This one states a type nothing checks.
 *
 * `jsonb(name)` hands back `unknown`, and the `tags` token declares `string[]`
 * — a real disagreement, which the storage contract now reports as a `tsc`
 * error rather than losing. The cast is the acknowledged answer, NOT a repair.
 * It is tolerable only because Postgres genuinely decodes the JSON, so the sole
 * thing being claimed here is the ELEMENT shape — categorically weaker than the
 * text tier, where the field's schema really runs, which is why an assertion is
 * tolerated here and inexpressible there.
 *
 * And it currently guards nothing at runtime: `tagsField` has **no
 * `defineEntity` call site** — it is used only in config_v2 surfaces (the
 * salsanueva source config), never in a table. That is what makes deferring it
 * acceptable. Putting a `tagsField` in a table is what would change it, and at
 * that point it wants a real jsonb decoder rather than an inherited cast —
 * `research/2026-08-25-global-decoded-entity-columns.md` §7, measured at ~2× a
 * jsonb column's decode cost for a weaker guarantee, so it needs its own design.
 *
 * `.$type<string[]>()` is not the honest spelling and does not even compile
 * here: drizzle's `$Type<T, TType> = T & { _: { $type: TType } }` writes
 * `_.$type` and never `_.data`, which is what this signature reads. (`$type()`
 * is `return this` — it runs nothing either.) A cast that says "assertion" is
 * the truthful spelling of an assertion.
 *
 * `sql-column/no-asserted-column-type` scopes on a literal `text(` / `varchar(`
 * / `char(` root, so `jsonb(` is deliberately outside it: no suppression here,
 * and none wanted.
 */
export const build = (name: string): StorageColumnFor<string[]> =>
  jsonb(name) as StorageColumnFor<string[]>;
