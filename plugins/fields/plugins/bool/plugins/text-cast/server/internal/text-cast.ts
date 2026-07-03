import { sql } from "drizzle-orm";
import type { ValueTextCast } from "@plugins/fields/plugins/server-capabilities/server";

/** Presents a custom DataView column's raw TEXT storage value as a boolean so
 *  server-delegated filter predicates and ORDER BY / keyset seek compare it as a
 *  boolean. `(NULL)::boolean` = NULL for a never-set value. */
export const cast: ValueTextCast = (c) => sql`(${c})::boolean`;
