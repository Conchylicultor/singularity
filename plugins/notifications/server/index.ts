import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { notificationsResource } from "./internal/resources";
import { handleCreate } from "./internal/handle-create";
import { handleDismiss } from "./internal/handle-dismiss";
import { handleDismissAll } from "./internal/handle-dismiss-all";
import { handleMarkAllRead } from "./internal/handle-mark-read";
import { ttlCleanupJob } from "./internal/ttl-cleanup";
import {
  createNotification,
  dismissAllNotifications,
  markAllNotificationsRead,
  dismissNotification,
} from "../shared/endpoints";

export { _notifications } from "./internal/tables";
export { notificationsResource } from "./internal/resources";
export { recordNotification } from "./internal/record-notification";
export type { RecordNotificationInput } from "./internal/record-notification";

export default {
  name: "Notifications",
  description: "Persistent bell-button notifications backed by the DB.",
  contributions: [Resource.Declare(notificationsResource)],
  register: [ttlCleanupJob],
  httpRoutes: {
    [createNotification.route]: handleCreate,
    [dismissAllNotifications.route]: handleDismissAll,
    [markAllNotificationsRead.route]: handleMarkAllRead,
    [dismissNotification.route]: handleDismiss,
  },
  async onReady() {
    await ttlCleanupJob.enqueue(
      {},
      { runAt: new Date(Date.now() + 3_600_000) },
    );
  },
} satisfies ServerPluginDefinition;
