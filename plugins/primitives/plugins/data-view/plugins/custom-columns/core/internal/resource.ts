import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { CustomColumnValueRowSchema, type CustomColumnValueRow } from "./types";

/**
 * Live per-surface custom-column values, keyed by `{ dataViewId }`. The server
 * resource is push-mode: its loader queries `data_view_custom_values` for the
 * surface, so the L4 DB change-feed recomputes it automatically on every write
 * (read-set match) — no explicit notify, `dependsOn`, or `identityTable`.
 */
export const customColumnValuesResource = resourceDescriptor<
  CustomColumnValueRow[],
  { dataViewId: string }
>("data-view-custom-values", z.array(CustomColumnValueRowSchema), []);
