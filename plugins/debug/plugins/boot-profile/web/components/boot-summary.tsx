import { type ReactElement } from "react";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { formatDuration } from "@plugins/debug/plugins/profiling/web";
import type { BootTrace } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/web";

interface SummaryRow {
  label: string;
  /** Absolute offset on the boot clock (ms), or null when unavailable. */
  atMs: number | null;
}

const COLUMNS: ColumnDef<SummaryRow>[] = [
  { id: "label", header: "Milestone", value: (r) => r.label },
  {
    id: "at",
    header: "At",
    align: "end",
    width: "8rem",
    value: (r) => r.atMs ?? Number.POSITIVE_INFINITY,
    cell: (r) =>
      r.atMs === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-mono tabular-nums">+{formatDuration(r.atMs)}</span>
      ),
  },
];

/** End offset (startMs + durationMs) of the first span with the given id. */
function spanEnd(trace: BootTrace, id: string): number | null {
  const span = trace.spans.find((s) => s.id === id);
  return span ? span.startMs + span.durationMs : null;
}

/**
 * Headline "request → first paint" decomposition in one glance: TTFB, response
 * end, plugin load, boot tasks, first React commit, first-contentful-paint.
 */
export function BootSummary({ trace }: { trace: BootTrace }): ReactElement {
  const nav = trace.navigation;
  const rows: SummaryRow[] = [
    { label: "TTFB (response start)", atMs: nav?.responseStartMs ?? null },
    { label: "Response end", atMs: nav?.responseEndMs ?? null },
    { label: "Plugins loaded", atMs: spanEnd(trace, "load-plugins") },
    { label: "Boot tasks done", atMs: spanEnd(trace, "boot-tasks") },
    { label: "First React commit", atMs: trace.firstCommitMs },
    {
      label: "First-contentful-paint",
      atMs: trace.paint.firstContentfulPaintMs,
    },
  ];

  return (
    <Inset pad="lg">
      <Stack as="section" gap="sm">
        <SectionLabel>Boot milestones (request → first paint)</SectionLabel>
        <DataTable
          data={rows}
          columns={COLUMNS}
          rowKey={(r) => r.label}
          emptyLabel="No boot trace captured."
        />
      </Stack>
    </Inset>
  );
}
