import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LiveStateStaleDropPayloadSchema } from "@plugins/reports/plugins/live-state-stale-drop/core";

// One-line Debug → Reports summary for the live-state-stale-drop kind: the
// wedged resource key, the drop reason (stale-version = same-boot strict-`<`;
// stale-epoch = cross-boot case 3), and the consecutive-drop count. No trace —
// the drop is a client-side guard decision, not a server flight window.
export function LiveStateStaleDropKindView({ report }: { report: Report }) {
  const parsed = LiveStateStaleDropPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.reason}
      </Badge>
      <span className="truncate font-mono" title={d.key}>
        {d.key}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {d.consecutiveDrops} consecutive drops
      </span>
    </Inline>
  );
}
