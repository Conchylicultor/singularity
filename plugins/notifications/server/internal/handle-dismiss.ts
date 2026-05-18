import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { dismissNotification } from "../../shared/endpoints";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleDismiss = implement(dismissNotification, async ({ params }) => {
  const { id } = params;
  if (!id) throw new HttpError(400, "Missing id");
  await db
    .update(_notifications)
    .set({ dismissed: true })
    .where(eq(_notifications.id, id));
  notificationsResource.notify();
  return { ok: true };
});
