import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { Report } from "../core/resources";
import { ReportSummaryFallback } from "./internal/report-summary-fallback";

// Per-kind report rendering registry. Each report kind contributes one KindView
// whose `match` is its kind discriminator and whose `component` renders the
// one-line summary shown in the Debug → Reports list from the report row. The
// list dispatches by `report.kind` instead of sniffing kind-specific columns —
// so adding a kind needs zero changes to the list. Dispatch (not render) because
// exactly one view paints per row, selected by kind — not a reorderable list.
// A kind with no registered view falls back to the generic message.
export interface KindViewProps {
  report: Report;
}

export const Reports = {
  KindView: defineDispatchSlot<KindViewProps, string>("reports.kind-view", {
    key: (props) => props.report.kind,
    fallback: ReportSummaryFallback,
  }),
};
