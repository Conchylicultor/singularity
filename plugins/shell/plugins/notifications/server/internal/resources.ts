import { desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _notifications } from "./tables";
import { notificationsResource as notificationsDescriptor } from "../../shared/resources";

export const notificationsResource = defineResource(notificationsDescriptor, {
  mode: "push",
  loader: async () =>
    db
      // Explicit columns: dedupKey is a server-internal dedup mechanism and
      // must not leak into the client wire payload (NotificationSchema).
      .select({
        id: _notifications.id,
        type: _notifications.type,
        title: _notifications.title,
        description: _notifications.description,
        variant: _notifications.variant,
        dismissed: _notifications.dismissed,
        read: _notifications.read,
        muted: _notifications.muted,
        linkTo: _notifications.linkTo,
        metadata: _notifications.metadata,
        count: _notifications.count,
        lastSeenAt: _notifications.lastSeenAt,
        createdAt: _notifications.createdAt,
      })
      .from(_notifications)
      .where(eq(_notifications.dismissed, false))
      .orderBy(desc(_notifications.createdAt)),
});
