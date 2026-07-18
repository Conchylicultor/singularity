import { eq } from "drizzle-orm";
import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { _notifications } from "./tables";
import { notificationsResource as notificationsDescriptor } from "../../shared/resources";

// Bounded ordered window (desc createdAt, default 200 / max 500). Window
// membership + the order-signature seam cover BOTH mutable behaviors that used to
// mandate a FULL recompute: a dismiss (where-flip on the mutable `dismissed`
// column) is detected as a membership EXIT and shipped as a real delete + order,
// and a resurface (which bumps the `createdAt` order column via UPDATE) is
// detected as an order-column change and re-floated to the window top via one
// bounded ids query + a membership delta with fresh order. A count/lastSeenAt-only
// dedup bump changes no order column, so it stays a single in-place upsert (no ids
// query). `createdAt` is projected in the select below — the compiler derives the
// order signature from the wire row and throws at module eval if an order column
// is unprojected.
export const notificationsResource = windowQueryResource(notificationsDescriptor, {
  from: _notifications,
  // Explicit columns: dedupKey is a server-internal dedup mechanism and must
  // not leak into the client wire payload (NotificationSchema).
  select: {
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
  },
  where: eq(_notifications.dismissed, false),
  orderBy: { col: _notifications.createdAt, dir: "desc" },
  window: { maxLimit: 500 },
});
