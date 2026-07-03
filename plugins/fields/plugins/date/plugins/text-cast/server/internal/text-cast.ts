import { sql } from "drizzle-orm";
import type { ValueTextCast } from "@plugins/fields/plugins/server-capabilities/server";

/** Presents a custom DataView column's raw TEXT storage value as a timestamptz
 *  so server-delegated filter predicates and ORDER BY / keyset seek compare it as
 *  a timestamp. `(NULL)::timestamptz` = NULL for a never-set value. */
export const cast: ValueTextCast = (c) => sql`(${c})::timestamptz`;
