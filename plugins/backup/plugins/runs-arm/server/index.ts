import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { backupRunKind } from "./internal/run-kind";

export default {
  description:
    "The backup arm of the unified run space: binds backup_runs into the runs union — its native status folded into the shared outcome vocabulary (partial included, since backup is the only kind that can half-succeed), a label naming what the run covered, and the source / target counts plus the raw per-target results as its own columns. Reads null for namespace (a backup covers the machine, not a checkout — the table's own namespace column is the in-flight index's scope discriminator, not a fact about the run) and for message (a backup's failure words are per-target).",
  register: [backupRunKind],
} satisfies ServerPluginDefinition;
