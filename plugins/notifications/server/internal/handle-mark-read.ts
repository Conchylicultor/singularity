import { and, eq } from "drizzle-orm";
import { db } from "@server/db/client";
import type { HttpHandler } from "@server/types";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleMarkAllRead: HttpHandler = async () => {
  await db
    .update(_notifications)
    .set({ read: true })
    .where(and(eq(_notifications.dismissed, false), eq(_notifications.read, false)));
  notificationsResource.notify();
  return Response.json({ ok: true });
};
