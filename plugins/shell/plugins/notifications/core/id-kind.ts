import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A notification's id (`notifications.id`), declared once (`plugins/ids`).
 * Minted on both sides: by the server's `recordNotification`, and by the
 * browser's `toast()` — which names the row itself so it can recognise its
 * own echo when the live list delivers it. Rows minted as `notif-<ms>-<≤6>`
 * stay recognised.
 */
export const notificationIdKind = defineIdKind({
  prefix: "notif",
  label: "Notification",
});

export type NotificationId = IdOf<typeof notificationIdKind>;
