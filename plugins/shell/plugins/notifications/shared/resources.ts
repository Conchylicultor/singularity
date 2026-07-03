import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { NotificationSchema, type Notification } from "./schema";

// Keyed query-resource contract: rows key on `id`. The server half is compiled
// from the drizzle declaration in `server/internal/resources.ts` (K/full — its
// `dismissed = false` filter is a mutable-membership `where`, see the compiler's
// CLAUDE.md). The wire shape stays `Notification[]`.
export const notificationsResource = queryResourceDescriptor<Notification>(
  "notifications",
  NotificationSchema,
  "id",
  { bootCritical: true },
);
