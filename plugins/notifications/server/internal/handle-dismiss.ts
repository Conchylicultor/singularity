import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import type { HttpHandler } from "@server/types";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";

export const handleDismiss: HttpHandler = async (_req, params) => {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });
  await db
    .update(_notifications)
    .set({ dismissed: true })
    .where(eq(_notifications.id, id));
  notificationsResource.notify();
  return Response.json({ ok: true });
};
