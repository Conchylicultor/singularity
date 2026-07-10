import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/server";

/**
 * Generic per-view-instance manual ROW ORDER, keyed by
 * `(dataViewId, viewId, rowKey)`. Works for ANY DataView regardless of its
 * backing data source: `dataViewId` is the surface (`storageKey`), `viewId` the
 * view **instance** that owns this order (two instances of the same surface hold
 * different orders), `rowKey` the consumer's `rowKey(row, 0)`.
 *
 * `rowKey` is an opaque string, NOT a foreign key — a DB cascade is impossible,
 * so a deleted row leaves a stale entry until the view's next reorder replaces
 * the set. Identical bounded-table posture as `data_view_custom_values`; see this
 * plugin's CLAUDE.md § Retention.
 */
export const _dataViewRowOrder = pgTable(
  "data_view_row_order",
  {
    dataViewId: text("data_view_id").notNull(),
    viewId: text("view_id").notNull(),
    rowKey: text("row_key").notNull(),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dataViewId, t.viewId, t.rowKey] }),
    index("dvro_view_idx").on(t.dataViewId, t.viewId),
  ],
);
