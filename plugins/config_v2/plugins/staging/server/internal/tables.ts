import {
  defineEntity,
  defaultNow,
} from "@plugins/infra/plugins/entities/server";
import { stagedConfigDefaultFields } from "../../core";

// Worktree-local holding area for config documents staged as "default for
// everyone". Last-write-wins per (plugin_id, config_name) — the composite key
// that derives the on-disk config storePath. Rows are written by the stage
// endpoint, read by the live resource + review section, and consumed (deleted)
// by apply/discard. The full `value` document is validated against the
// descriptor schema at apply time, not at write time — see handlers.ts.
//
// The table + the `StagedConfigDefault` wire schema both derive from the single
// `stagedConfigDefaultFields` record (core), so a column/schema drift is
// unrepresentable.
const stagedConfigDefault = defineEntity(
  "staged_config_default",
  stagedConfigDefaultFields,
  {
    primaryKey: ["pluginId", "configName"],
    columns: {
      updatedAt: { default: defaultNow() },
    },
  },
);

// drizzle-kit schema-glob discovery. Name kept so consumers don't churn.
export const _stagedConfigDefault = stagedConfigDefault.table;
