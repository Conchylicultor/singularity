import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { notificationsResource } from "./internal/resources";
import { handleDismiss } from "./internal/handle-dismiss";
import { handleDismissAll } from "./internal/handle-dismiss-all";
import { handleMarkAllRead } from "./internal/handle-mark-read";
import { dismissAllNotifications, markAllNotificationsRead, dismissNotification } from "../shared/endpoints";

export { _notifications } from "./internal/tables";
export { notificationsResource } from "./internal/resources";
export { recordNotification } from "./internal/record-notification";
export type { RecordNotificationInput } from "./internal/record-notification";

export default {
  id: "notifications",
  name: "Notifications",
  description: "Persistent bell-button notifications backed by the DB.",
  contributions: [Resource.Declare(notificationsResource)],
  httpRoutes: {
    [dismissAllNotifications.route]: handleDismissAll,
    [markAllNotificationsRead.route]: handleMarkAllRead,
    [dismissNotification.route]: handleDismiss,
  },
} satisfies ServerPluginDefinition;
