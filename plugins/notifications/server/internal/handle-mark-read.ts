import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { markAllNotificationsRead } from "../../shared/endpoints";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleMarkAllRead = implement(markAllNotificationsRead, async () => {
  await db
    .update(_notifications)
    .set({ read: true })
    .where(and(eq(_notifications.dismissed, false), eq(_notifications.read, false)));
  notificationsResource.notify();
  return { ok: true };
});
