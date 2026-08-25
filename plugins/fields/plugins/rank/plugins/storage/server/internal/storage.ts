import { rankText } from "@plugins/primitives/plugins/rank/core";
import type { StorageColumnFor } from "@plugins/fields/plugins/server-capabilities/server";

// Maps the `rank` field token to the `rank_text` Postgres domain column
// (TEXT COLLATE "C"), so fractional-indexing keys sort by byte order. Resolved
// by exact token through `resolveFieldStorage("rank")`.
export const build = (name: string): StorageColumnFor<string> => rankText(name);
