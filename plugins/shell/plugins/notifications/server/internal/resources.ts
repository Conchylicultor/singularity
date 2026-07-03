import { desc, eq } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { _notifications } from "./tables";
import { notificationsResource as notificationsDescriptor } from "../../shared/resources";

// Compiled keyed query-resource, declared K/FULL (`recompute`), NOT
// identityTable-scoped: the `dismissed = false` filter is a MUTABLE-membership
// `where`. Dismissing flips `dismissed` via UPDATE — under a scoped refill the
// row would simply not be returned, and `diffKeyedScoped` never emits deletes,
// so the dismissed row would sit stale in every client snapshot until the next
// FULL. The FULL recompute re-runs the whole query and diffs keyed
// (`diffKeyedFull`), so a dismissal ships as a proper per-row delete — and the
// in-place read/mute flips still ship as single-row upserts instead of the
// whole array (the Layer-1 keyed-diff win this migration is after).
export const notificationsResource = queryResource(notificationsDescriptor, {
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
  orderBy: desc(_notifications.createdAt),
  recompute: {
    kind: "full",
    reason:
      "where-filtered membership: dismiss/dismiss-all flip `dismissed` via UPDATE, removing rows from the result set — a scoped refill cannot delete (diffKeyedScoped never emits deletes)",
  },
});
