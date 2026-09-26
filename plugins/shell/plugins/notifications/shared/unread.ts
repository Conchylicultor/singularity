import {
  and,
  liveBoolean,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { NotificationVariantSchema } from "./schema";

// The ONE statement of "a notification the bell counts as unread": not read, not
// muted, and loud (an error or a warning). The panel tests it in memory
// (`matchesFilter`) and the badge's loader compiles it to SQL (`filterSql`) —
// both through the filter language's one op table, which its parity suite pins
// against Postgres, so the badge and the panel's "unread" split cannot disagree.
// The base membership (`dismissed = false`) is not part of it: it is the
// collection's `where`, and the loader ANDs it in the same way.
export const countedUnreadFilterable = {
  read: liveBoolean(),
  muted: liveBoolean(),
  variant: liveText(NotificationVariantSchema),
};

export const countedUnread = and<typeof countedUnreadFilterable>(
  { column: "read", op: "eq", operand: false },
  { column: "muted", op: "eq", operand: false },
  { column: "variant", op: "in", operand: ["error", "warning"] },
);
