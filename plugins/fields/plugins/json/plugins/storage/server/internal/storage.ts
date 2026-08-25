import { jsonb } from "drizzle-orm/pg-core";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";

// `unknown` is what a jsonb column honestly hands back: Postgres really decodes
// the JSON, so its SHAPE was never checked by anything. The `T` on a
// `jsonField<T>` column comes from `defineEntity`'s cast and is an ASSERTION —
// the weaker tier, stated here rather than implied. Giving it a decoder is a
// follow-up (`research/2026-08-25-global-decoded-entity-columns.md` §7).
export const build = (name: string): StorageColumnFor<unknown> => jsonb(name);
