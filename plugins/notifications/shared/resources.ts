import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { NotificationSchema, type Notification } from "./schema";

export const notificationsResource = resourceDescriptor<Notification[]>(
  "notifications",
  z.array(NotificationSchema),
);
