import type { ServerPluginDefinition } from "@server/types";
import { notificationsResource } from "./internal/resources";
import { handleDismiss } from "./internal/handle-dismiss";
import { handleDismissAll } from "./internal/handle-dismiss-all";
import { handleMarkAllRead } from "./internal/handle-mark-read";

export { _notifications } from "./internal/tables";
export { notificationsResource } from "./internal/resources";
export { recordNotification } from "./internal/record-notification";
export type { RecordNotificationInput } from "./internal/record-notification";

export default {
  id: "notifications",
  name: "Notifications",
  description: "Persistent bell-button notifications backed by the DB.",
  resources: [notificationsResource],
  httpRoutes: {
    "POST /api/notifications/dismiss-all": handleDismissAll,
    "POST /api/notifications/mark-all-read": handleMarkAllRead,
    "POST /api/notifications/:id/dismiss": handleDismiss,
  },
} satisfies ServerPluginDefinition;
