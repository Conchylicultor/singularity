import { sql } from "drizzle-orm";
import type { ValueTextCast } from "@plugins/fields/plugins/server-capabilities/server";

/** Presents a custom DataView column's raw TEXT storage value as a numeric so
 *  server-delegated filter predicates and ORDER BY / keyset seek compare it as a
 *  number. `(NULL)::numeric` = NULL, so a missing value drops out of comparisons
 *  as expected. */
export const cast: ValueTextCast = (c) => sql`(${c})::numeric`;
