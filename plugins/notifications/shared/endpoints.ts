import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { NotificationVariantSchema } from "./schema";

export const createNotification = defineEndpoint({
  route: "POST /api/notifications",
  body: z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string(),
    variant: NotificationVariantSchema,
    linkTo: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
    dedupeKey: z.string().nullable().optional(),
  }),
  response: z.object({ id: z.string() }),
});

export const dismissAllNotifications = defineEndpoint({
  route: "POST /api/notifications/dismiss-all",
});

export const markAllNotificationsRead = defineEndpoint({
  route: "POST /api/notifications/mark-all-read",
});

export const dismissNotification = defineEndpoint({
  route: "POST /api/notifications/:id/dismiss",
});
