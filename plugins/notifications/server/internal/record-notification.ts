import { db } from "@server/db/client";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";
import type { NotificationVariant } from "../../shared/schema";

export interface RecordNotificationInput {
  type: string;
  title: string;
  description: string;
  variant: NotificationVariant;
  linkTo?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordNotification(
  input: RecordNotificationInput,
): Promise<string> {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(_notifications).values({
    id,
    type: input.type,
    title: input.title,
    description: input.description,
    variant: input.variant,
    linkTo: input.linkTo ?? null,
    metadata: input.metadata ?? null,
  });
  notificationsResource.notify();
  return id;
}
