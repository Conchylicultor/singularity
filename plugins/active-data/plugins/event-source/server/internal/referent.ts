import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _eventSources } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { eventSourceIdKind } from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { IdReferent } from "@plugins/ids/server";

/** An `evs-<id>`'s source name, for text a model reads. */
export async function resolveEventSourceReferent(
  id: string,
): Promise<IdReferent> {
  const [source] = await db
    .select({ name: _eventSources.name })
    .from(_eventSources)
    .where(eq(_eventSources.id, eventSourceIdKind.key(id)))
    .limit(1);
  return source ? { found: true, title: source.name } : { found: false };
}
