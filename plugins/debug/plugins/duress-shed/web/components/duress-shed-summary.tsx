import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { DuressShedPayloadSchema } from "../../core";

// One-line duress-shed summary for the Debug → Reports list, e.g.
// "`slow-ops` — 240 shed / 12 dropped (240 replayed)". The buffer kind renders
// as a warning-colored mono chip; the shed/dropped/replayed accounting trails.
export function DuressShedSummary({ report }: { report: Report }) {
  const parsed = DuressShedPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const shed = Object.values(d.byCascade).reduce((a, c) => a + c.shed, 0);
  const dropped = Object.values(d.byCascade).reduce((a, c) => a + c.dropped, 0);

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.kind}
      </Badge>
      <span>
        — {shed} shed / {dropped} dropped
      </span>
      <span className="text-muted-foreground">
        ({d.replayed} replayed
        {d.replayErrors > 0 ? `, ${d.replayErrors} replay errors` : ""})
      </span>
    </Inline>
  );
}
