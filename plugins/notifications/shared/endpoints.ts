import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const dismissAllNotifications = defineEndpoint({
  route: "POST /api/notifications/dismiss-all",
});

export const markAllNotificationsRead = defineEndpoint({
  route: "POST /api/notifications/mark-all-read",
});

export const dismissNotification = defineEndpoint({
  route: "POST /api/notifications/:id/dismiss",
});
