import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdArchive, MdCloudUpload, MdFolder } from "react-icons/md";
import { Runs } from "@plugins/runs/web";
import { BACKUP_RUN_KIND } from "@plugins/backup/core";
import { BackupRunDetail, backupRunPane } from "@plugins/backup/web";
import { BackupRunFields } from "./components/backup-run-fields";
import {
  BackupArchiveSize,
  BackupSourcesSection,
  BackupTargetsSection,
} from "./components/backup-run-sections";
import {
  backupArchiveSize,
  backupSources,
  backupTargetResults,
} from "./internal/payload";

export default {
  description:
    "The backup arm's presence on the merged run surface: the kind's label, its rows' activation into the backup run-detail pane, its four scalar columns (native status, archive size, source and target counts) as real filterable and sortable SQL dimensions, and the three detail sections — the archive's size on one line, the manifest's source reports, and the per-target outcome with its Grant access remediation.",
  contributions: [
    Runs.Kind({
      kind: BACKUP_RUN_KIND,
      label: "Backup",
      open: (run, { openPane }) =>
        openPane(backupRunPane, { runId: run.id }, { mode: "push" }),
    }),
    Runs.Fields({
      id: BACKUP_RUN_KIND,
      section: "Backup",
      component: BackupRunFields,
    }),
    // A one-line section: no `component`, so the host paints one static row
    // with no chevron and nothing to expand. How big the archive came out is
    // the first question asked of a finished backup — a nightly archive that
    // halved means a source stopped contributing — so it sits above the two
    // lists that say what went in and where it went.
    BackupRunDetail.Section({
      id: "archive",
      label: "Archive",
      icon: MdArchive,
      summary: BackupArchiveSize,
      // A run that failed before producing an archive has no size, and a titled
      // row reading nothing is worse than no row. Same gate the other two take.
      useAvailable: ({ run }) => backupArchiveSize(run) !== null,
    }),
    // Two sections, not two sub-plugins. Both decode two jsonb columns off the
    // SAME row with the SAME decoders, owned by this arm — the modularity a
    // split would buy is already bought by the slot, and the seam is there for
    // when `backup/targets/google-drive` wants a section of its own.
    BackupRunDetail.Section({
      id: "sources",
      label: "Sources",
      icon: MdFolder,
      component: BackupSourcesSection,
      // Required rather than a `return null`: the host paints the card before
      // the body and cannot see through it, so an empty manifest would leave a
      // titled bar over nothing. A pre-manifest run has no sources yet.
      useAvailable: ({ run }) => backupSources(run).length > 0,
    }),
    BackupRunDetail.Section({
      id: "targets",
      label: "Targets",
      icon: MdCloudUpload,
      component: BackupTargetsSection,
      useAvailable: ({ run }) => backupTargetResults(run).length > 0,
      // The section holding the only repair path opens itself when there is
      // something to repair. Someone whose backup just broke should not have to
      // find the disclosure that hides the button.
      useDefaultOpen: ({ run }) => backupTargetResults(run).some((t) => !t.ok),
    }),
  ],
} satisfies PluginDefinition;
