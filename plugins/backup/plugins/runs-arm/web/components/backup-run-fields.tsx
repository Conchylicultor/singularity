import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { armNumber, armText, runArmFields } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import { BACKUP_RUN_STATUSES, backupRunFields } from "../../core";
import { backupArchiveSize } from "../internal/payload";
import { formatBytes } from "../internal/format-bytes";

/** A number column reads as nothing on another kind's row, never as zero. */
function numberCell(
  value: number | null,
  render: (n: number) => string,
): ReactNode {
  return value === null ? null : (
    <span className="text-muted-foreground">{render(value)}</span>
  );
}

/**
 * The backup arm's own columns in the merged run DataView.
 *
 * Every one is a real projected SQL column, bound to the arm's
 * `defineRunArmFields` declaration twice over — `runArmFields` checks the
 * `FieldDef.id`, and `armText` / `armNumber` check the accessor's type against
 * the same declaration. A field id that drifts off its server column does not
 * fail at runtime; it silently degrades into client-side-only filtering over the
 * loaded window, so both halves are made not to compile instead.
 *
 * Three of the four default to hidden. They are dimensions first: "backups whose
 * archive is over a gigabyte" is a filter that compiles to SQL across the whole
 * ledger, and a column blank on three kinds out of four does not earn a
 * permanent place in a mixed table.
 *
 * `backup.archiveSize` is the one that does earn it, and the reason is not that
 * it is more interesting — it is that it is the only fact a backup row otherwise
 * carries nowhere. "Succeeded" says the archive was written; it does not say
 * whether it holds a gigabyte or forty bytes, and a nightly backup that
 * quietly halves is a source that stopped contributing. `outcome` cannot report
 * that and the label does not carry it. The three it sits beside are each
 * answered better elsewhere: the native status is `outcome` at a finer grain,
 * and the two counts are the headline of the Sources and Targets sections in the
 * detail pane, which name them rather than counting them.
 *
 * On another kind's row it reads as nothing, never as zero — so what it costs a
 * mixed table is one blank column, and that is the trade being made.
 *
 * `backup.status` is the native status kept beside the shared `outcome`. The two
 * are not redundant: `outcome` is the axis a person filters by across every
 * kind, and this is the precision that would otherwise be lost to it.
 */
export function BackupRunFields({
  render,
}: FieldExtensionProps<UnionRun>): ReactNode {
  const fields = useMemo<FieldDef<UnionRun>[]>(() => {
    const status = armText(backupRunFields, "backup.status");
    const sourceCount = armNumber(backupRunFields, "backup.sourceCount");
    const targetCount = armNumber(backupRunFields, "backup.targetCount");
    return runArmFields(backupRunFields, [
      {
        id: "backup.status",
        label: "Backup status",
        type: "enum",
        options: BACKUP_RUN_STATUSES.map((value) => ({ value, label: value })),
        value: status,
        cell: (r) => {
          const v = status(r);
          return v === null ? null : <Badge variant="muted">{v}</Badge>;
        },
        sortable: true,
        filterable: true,
        groupable: true,
        visible: false,
        width: "8rem",
      },
      {
        id: "backup.archiveSize",
        label: "Archive size",
        type: "number",
        // The same accessor the detail pane's Archive line reads, so the
        // column and the line cannot disagree about the run's size.
        value: backupArchiveSize,
        cell: (r) => numberCell(backupArchiveSize(r), formatBytes),
        sortable: true,
        filterable: true,
        width: "7rem",
      },
      {
        id: "backup.sourceCount",
        label: "Sources",
        type: "number",
        value: sourceCount,
        cell: (r) => numberCell(sourceCount(r), String),
        sortable: true,
        filterable: true,
        visible: false,
        width: "6rem",
      },
      {
        id: "backup.targetCount",
        label: "Targets",
        type: "number",
        value: targetCount,
        cell: (r) => numberCell(targetCount(r), String),
        sortable: true,
        filterable: true,
        visible: false,
        width: "6rem",
      },
    ]);
  }, []);

  return <>{render(fields)}</>;
}
