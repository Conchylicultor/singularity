import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { RunRow } from "@plugins/runs/core";
import { BACKUP_RUN_STATUSES, backupRunColumns } from "../../core";
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
 * Every one binds the arm's own column (`backupRunColumns.column(…)`), so its
 * sort and filter are SQL over the union, and its value is read off the arm's
 * slice of the row (`null` on another kind's row).
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
}: FieldExtensionProps<RunRow>): ReactNode {
  const fields = useMemo<FieldDef<RunRow>[]>(() => {
    const own = (r: RunRow) => backupRunColumns.read(r);
    const status = (r: RunRow) => own(r)?.status ?? null;
    const sourceCount = (r: RunRow) => own(r)?.sourceCount ?? null;
    const targetCount = (r: RunRow) => own(r)?.targetCount ?? null;
    return [
      {
        id: "backup.status",
        column: backupRunColumns.column("status"),
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
        column: backupRunColumns.column("archiveSize"),
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
        column: backupRunColumns.column("sourceCount"),
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
        column: backupRunColumns.column("targetCount"),
        label: "Targets",
        type: "number",
        value: targetCount,
        cell: (r) => numberCell(targetCount(r), String),
        sortable: true,
        filterable: true,
        visible: false,
        width: "6rem",
      },
    ];
  }, []);

  return <>{render(fields)}</>;
}
