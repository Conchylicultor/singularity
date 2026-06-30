import { type PgColumnBuilderBase } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

// Maps the `rank` field token to the `rank_text` Postgres domain column
// (TEXT COLLATE "C"), so fractional-indexing keys sort by byte order. Resolved
// by exact token through `resolveFieldStorage("rank")`.
export const build = (name: string): PgColumnBuilderBase => rankText(name);
