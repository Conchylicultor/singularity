import { eq } from "drizzle-orm";
import { serveCollection } from "@plugins/network/plugins/live/server";
import { _notifications } from "./tables";
import { notifications } from "../../shared/resources";

// The collection IS the undismissed rows: `dismissed = false` is the base
// membership, ANDed into the window, the `:rows` point reads and every grouping,
// so a dismiss is a membership exit (a real delete in the window delta) and a
// recount of the groups. The projection is derived from `NotificationSchema`, so
// the server-internal `dedupKey` can never reach the wire. `createdAt` is the one
// sortable column: a resurface (which bumps it) is re-floated via one bounded ids
// query, while a count/lastSeenAt-only dedup bump stays an in-place upsert.
export const notificationsServed = serveCollection(notifications, {
  from: _notifications,
  where: eq(_notifications.dismissed, false),
});
