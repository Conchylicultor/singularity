import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { NotificationSchema, type Notification } from "./schema";

export const notificationsResource = resourceDescriptor<Notification[]>(
  "notifications",
  z.array(NotificationSchema),
  [],
);
