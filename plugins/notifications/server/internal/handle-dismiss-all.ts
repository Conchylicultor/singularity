import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { HttpHandler } from "@server/types";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleDismissAll: HttpHandler = async () => {
  await db
    .update(_notifications)
    .set({ dismissed: true })
    .where(eq(_notifications.dismissed, false));
  notificationsResource.notify();
  return Response.json({ ok: true });
};
