import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _notifications } from "./tables";

/**
 * Set `muted` for every notification whose metadata field `key` equals one of
 * `values`. `muted` is a snapshot of some classification taken at record time
 * (e.g. crash noise) — when the rules behind it change, the producer reconciles
 * the stored flag through here. Updates only rows that actually flip (the live
 * notifications resource refreshes via the L4 DB change-feed), and is a no-op for
 * an empty `values` list. Returns the number of rows updated.
 */
export async function setMutedByMetadata(
  key: string,
  values: string[],
  muted: boolean,
): Promise<number> {
  if (values.length === 0) return 0;
  const rows = await db
    .update(_notifications)
    .set({ muted })
    .where(
      and(
        inArray(sql`${_notifications.metadata} ->> ${key}`, values),
        eq(_notifications.muted, !muted),
      ),
    )
    .returning({ id: _notifications.id });
  return rows.length;
}
