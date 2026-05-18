import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { dismissAllNotifications } from "../../shared/endpoints";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleDismissAll = implement(dismissAllNotifications, async () => {
  await db
    .update(_notifications)
    .set({ dismissed: true })
    .where(eq(_notifications.dismissed, false));
  notificationsResource.notify();
  return { ok: true };
});
