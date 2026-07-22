import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { OpWedgePayloadSchema } from "../../core";

function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

// One-line cli-op-wedge summary for the Debug → Reports list, e.g.
// "`agent-42` check wedged 8.4h — spinning, 0 children · hot processTicksAndRejections · reaped".
// The worktree renders as a destructive-colored mono chip; the CPU verdict,
// live-child count, JS hot frame, and reap outcome trail, because those are the
// facts a reader triages on.
//
// A PARTIAL capture is surfaced right here in the one-liner: a report whose
// evidence is incomplete must never read as a complete one, not even in the
// list view where a reader decides whether to open it.
export function OpWedgeSummary({ report }: { report: Report }) {
  const parsed = OpWedgePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const c = d.capture;
  const partial =
    (c !== undefined && c.failures.length > 0) ||
    (d.jsProbe !== undefined && d.jsProbe.armed && d.jsProbe.failures.length > 0);
  // Leaf frame of the dominant sampled stack, e.g. "processTicksAndRejections".
  const hotFrame = d.jsProbe?.topStacks[0]?.stack.split(" < ")[0]?.split("|")[0];

  return (
    <Inline gap="xs">
      <Badge variant="destructive" mono>
        {d.worktree}
      </Badge>
      <span>
        {d.op} wedged {humanMs(d.wedgedMs)}
      </span>
      {c ? (
        <span className="text-muted-foreground">
          ({c.cpu.verdict}, {c.children.length} child{c.children.length === 1 ? "" : "ren"})
        </span>
      ) : (
        <span className="text-muted-foreground">(no capture)</span>
      )}
      {hotFrame !== undefined && hotFrame !== "" ? (
        <span className="text-muted-foreground">
          hot <span className="font-mono">{hotFrame}</span>
        </span>
      ) : null}
      {d.reap !== undefined && d.reap.outcome !== "disabled" ? (
        <Badge variant={d.reap.outcome === "survived" ? "destructive" : "success"}>
          {d.reap.outcome === "survived" ? "reap FAILED" : "reaped"}
        </Badge>
      ) : null}
      {partial ? <Badge variant="destructive">partial capture</Badge> : null}
    </Inline>
  );
}
