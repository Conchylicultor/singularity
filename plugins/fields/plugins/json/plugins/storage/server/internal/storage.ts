import { jsonb } from "drizzle-orm/pg-core";
import { ZodUnknown } from "zod";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

/**
 * The `jsonb` column, narrowed by whatever the FIELD's own schema says.
 *
 * `jsonField<T>({ schema })` used to get its `T` from `defineEntity`'s cast and
 * from nothing that ran — Postgres genuinely decodes the JSON, so the value was
 * real but its SHAPE was a claim about rows nobody checked. Handing the schema
 * to `parsedJson` makes the claim true: it is what decodes the column, on every
 * read and every write, and it normalizes as it goes (a `z.object` strips
 * undeclared keys in both directions).
 *
 * The cost is the schema's depth, not the payload's size — the largest jsonb
 * value in the repo (`traces.snapshot`, avg 123 KB) decodes in 1.7 µs, because
 * its schema is eight scalars plus a `z.record(z.unknown())`. So the opt-in dial
 * a per-field flag would have provided already exists, and it is the schema
 * itself. See `research/2026-08-26-global-decoded-jsonb-entity-columns.md`.
 */
export const decode = <V>(
  name: string,
  valueSchema: ZodParser<V>,
): StorageColumnFor<V> =>
  valueSchema instanceof ZodUnknown
    ? // `z.unknown()` — the column already holds exactly this, so there is
      // nothing for a decoder to verify.
      widestJsonColumn<V>(name)
    : parsedJson(name, valueSchema);

/**
 * The plain `jsonb` column, for the branch where the schema does not narrow it.
 *
 * The cast is SOUND, not a hope: `ZodUnknown`'s output type IS `unknown`, and
 * `unknown` is not assignable to any proper subtype of itself, so a
 * `ZodParser<V>` for a narrower `V` can never actually BE a `ZodUnknown`.
 * Passing the `instanceof` therefore proves `V` is `unknown`. TypeScript cannot
 * narrow a type parameter from an `instanceof`, so the equality is stated here
 * — once, with its proof — rather than at the branch.
 *
 * `ZodAny` is deliberately NOT in the branch, and the reason is that this proof
 * does not survive it: `z.any()` is `ZodType<any, …, any>`, and `any` IS
 * assignable to every `V`, so an `instanceof ZodAny` would prove nothing — a
 * `jsonField<Foo>({ schema: z.any() })` would skip the decoder while declaring
 * `Foo`. It falls through to `parsedJson`, where `z.any().parse` is a
 * pass-through that costs nothing and claims nothing.
 */
const widestJsonColumn = <V>(name: string): StorageColumnFor<V> =>
  jsonb(name) as unknown as StorageColumnFor<V>;
