import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { AdaptiveBarPayloadSchema } from "@plugins/reports/plugins/adaptive-bar/core";

// One-line Debug → Reports summary for the adaptive-bar kind: which assumption
// broke, which bar broke it, the occupant the evidence blames where there is
// one, and the primitive's own sentence about it. No trace — a layout fault is a
// disagreement between the fit math and the browser's layout engine, not a
// server flight window.
//
// The bar is named by its `origin` (the innermost UI-context node above its
// root) and only falls back to `label`, because the label defaults to "More" and
// several unrelated bars answer to it — a list of rows all reading "More" tells
// the reader nothing, which is the same collision the fingerprint fixes. The
// full lineage goes in the `title` rather than the line: it is what says which
// pane the bar was in, and it is far too long to render.
export function AdaptiveBarKindView({ report }: { report: Report }) {
  const parsed = AdaptiveBarPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const name = d.origin ?? d.label;
  // The occupant the finding is about. `item` names it outright (only
  // `empty-rung` has one); otherwise it is the first occupant whose own width
  // moved at an unchanged rung — the one a `no-convergence` task is most likely
  // to be about, and the only part of the evidence worth a whole line's width
  // here. Neither exists on the remaining faults, nor on a row filed before the
  // bar recorded rounds.
  const occupantId = d.item?.id ?? d.evidence?.moved[0]?.id;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.fault}
      </Badge>
      <span className="truncate" title={d.originPath ?? name}>
        {name}
      </span>
      {occupantId !== undefined && <Badge mono>{occupantId}</Badge>}
      <span className="text-muted-foreground truncate">{d.message}</span>
    </Inline>
  );
}
