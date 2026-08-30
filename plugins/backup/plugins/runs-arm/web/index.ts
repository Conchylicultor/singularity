import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "@plugins/runs/web";
import { BACKUP_RUN_KIND } from "../core";
import { BackupRunFields } from "./components/backup-run-fields";
import { BackupRunRow } from "./components/backup-run-row";

export default {
  description:
    "The backup arm's presence on the merged run surface: the kind's label, its four scalar columns (native status, archive size, source and target counts) as real filterable and sortable SQL dimensions, and the list row — the backup panel's expand/collapse card, moved — carrying the manifest's source reports and the per-target outcome with its Grant access remediation. Contributes no row activation, which is what lets the row hold those controls.",
  contributions: [
    // No `open`, and that is load-bearing rather than a gap: there is no per-run
    // backup detail surface to send anyone to, and a row that does not activate
    // renders as a plain container instead of a `<button>` — which is the only
    // way its disclosure trigger and its Grant access button can be real
    // buttons rather than buttons nested inside one.
    Runs.Kind({ kind: BACKUP_RUN_KIND, label: "Backup" }),
    Runs.Row({ match: BACKUP_RUN_KIND, component: BackupRunRow }),
    Runs.Fields({
      id: BACKUP_RUN_KIND,
      section: "Backup",
      component: BackupRunFields,
    }),
  ],
} satisfies PluginDefinition;
