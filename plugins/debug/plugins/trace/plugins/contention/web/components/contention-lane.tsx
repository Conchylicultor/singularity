import { type ReactElement } from "react";
import { ContentionSnapshotSchema } from "@plugins/infra/plugins/contention/core";
import { loadSeverity } from "@plugins/debug/plugins/slow-ops/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text, SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import type { TraceLaneProps } from "@plugins/debug/plugins/trace/plugins/engine/web";

// Cluster-wide contention at the trip: OS load average vs core count (tinted by
// the shared loadSeverity ramp — the same muted→warning→destructive scale the
// cluster timeline and health-monitor use) plus Postgres backend counts and the
// hottest databases. A footer card, not time bars — a single instant.
export function ContentionLane({ payload }: TraceLaneProps): ReactElement {
  const parsed = ContentionSnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    return (
      <Stack gap="xs" className="px-lg py-sm">
        <SectionLabel>Contention</SectionLabel>
        <Placeholder tone="muted">No contention snapshot for this trace.</Placeholder>
      </Stack>
    );
  }
  const c = parsed.data;
  const severity = loadSeverity(c.loadAvg1, c.cpuCount);

  return (
    <Stack gap="xs" className="px-lg py-sm">
      <SectionLabel>Contention</SectionLabel>
      <Card>
        <Cluster>
          <Badge variant={severity} mono>
            load {c.loadAvg1.toFixed(1)} / {c.loadAvg5.toFixed(1)} / {c.loadAvg15.toFixed(1)}
          </Badge>
          <Badge variant="muted" mono>
            {c.cpuCount} cores
          </Badge>
          <Badge variant={c.pgActiveBackends > c.cpuCount ? "warning" : "muted"} mono>
            pg {c.pgActiveBackends} active / {c.pgTotalBackends} total
          </Badge>
        </Cluster>
        {c.pgTopDatabases.length > 0 && (
          <Stack gap="2xs" className="pt-xs">
            <Text as="div" variant="caption" tone="muted">
              Top databases
            </Text>
            <Cluster>
              {c.pgTopDatabases.map((db) => (
                <Badge key={db.datname} variant="muted" mono>
                  {db.datname} ×{db.active}
                </Badge>
              ))}
            </Cluster>
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
