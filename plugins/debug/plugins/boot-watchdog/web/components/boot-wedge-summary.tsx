import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BootWedgePayloadSchema } from "../../core";

function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

// One-line boot-wedge summary for the Debug → Reports list, e.g.
// "`agent-42` never became ready — 11m (open)". The worktree renders as a
// destructive-colored mono chip; the un-ready duration + state trail.
export function BootWedgeSummary({ report }: { report: Report }) {
  const parsed = BootWedgePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="destructive" mono>
        {d.worktree}
      </Badge>
      <span>never became ready — {humanMs(d.wedgedMs)}</span>
      <span className="text-muted-foreground">({d.state})</span>
    </Inline>
  );
}
