import { useLiveRow } from "@plugins/network/plugins/live/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { rowReferent } from "@plugins/active-data/plugins/id-chip/web";
import { reportsList } from "@plugins/reports/core";
import { reportDetailPane } from "@plugins/debug/plugins/reports/web";
import type { IdReferentState } from "@plugins/ids/web";

/** A report's chip title — its kind and one-line message — from the by-id row read. */
export function useReportReferent(id: string): IdReferentState {
  return rowReferent(
    useLiveRow(reportsList, id),
    (r) => `${r.kind}: ${r.message}`,
  );
}

/** Opens the report's detail pane beside the surface holding the id (`push`). */
export function useOpenReport(): (id: string) => void {
  const openPane = useOpenPane();
  return (id) => openPane(reportDetailPane, { reportId: id }, { mode: "push" });
}
