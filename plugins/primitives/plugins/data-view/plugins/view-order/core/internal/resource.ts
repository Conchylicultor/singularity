import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RowOrderRowSchema, type RowOrderRow } from "./types";

/**
 * Live per-view-instance row order, keyed by `{ dataViewId, viewId }`. The
 * server resource is push-mode: its loader queries `data_view_row_order` for the
 * pair, so the L4 DB change-feed recomputes it automatically on every write
 * (read-set match) — no explicit notify, `dependsOn`, or `identityTable`.
 *
 * Rows arrive **rank-ordered** (`ORDER BY rank ASC`).
 */
export const rowOrderResource = resourceDescriptor<
  RowOrderRow[],
  { dataViewId: string; viewId: string }
>("data-view-row-order", z.array(RowOrderRowSchema), []);
