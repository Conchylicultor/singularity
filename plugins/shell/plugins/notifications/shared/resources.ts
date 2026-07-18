import { windowQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { NotificationSchema, type Notification } from "./schema";

// Bounded ordered window (desc createdAt, default 200 / max 500) — the bounded
// working-set migration off the former full-collection K/full scan. Rows key on
// `id`; the server half is a `windowQueryResource`. The `dismissed = false`
// where-flip is a membership exit/entry, and the resurface `createdAt` bump is an
// order-column change the runtime's order-signature seam re-floats via one bounded
// ids query — so a dismiss and a resurface both ship correct incremental deltas,
// and count/lastSeenAt-only dedup bumps stay in-place (zero ids queries). Web
// consumers read it via `useWindowResource`; the wire shape stays `Notification[]`.
export const notificationsResource = windowQueryResourceDescriptor<Notification>(
  "notifications",
  NotificationSchema,
  "id",
  { defaultLimit: 200, bootCritical: true },
);
