import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _notifications } from "./tables";
import { NotificationSchema } from "../../shared/schema";

export const notificationsResource = defineResource({
  key: "notifications",
  mode: "push",
  schema: z.array(NotificationSchema),
  loader: async () =>
    db
      .select()
      .from(_notifications)
      .where(eq(_notifications.dismissed, false))
      .orderBy(desc(_notifications.createdAt)),
});
