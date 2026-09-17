import type { RecordedColumn } from "../../core";
import type { analyticsHits, analyticsVisits } from "./tables";

/**
 * Compile-time proof that `RECORDED_FIELDS` (core, rendered as "What one visit
 * records") names exactly the columns the collect tables store.
 *
 * Row identifiers and the one internal pointer are the only columns that are
 * not "recorded" data. Add a column to `analytics_visits` / `analytics_hits`
 * without listing it in `RECORDED_COLUMNS` — or list one that is not stored —
 * and `StoredColumnsAreRecorded` stops being `true`, failing the build.
 */
type RowIdentifiers = "id" | "visitId" | "exitPageviewId";

type StoredColumn = Exclude<
  | keyof typeof analyticsVisits.$inferSelect
  | keyof typeof analyticsHits.$inferSelect,
  RowIdentifiers
>;

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type StoredColumnsAreRecorded = Exactly<StoredColumn, RecordedColumn>;
export const storedColumnsAreRecorded: StoredColumnsAreRecorded = true;
