import { useMemo, type ReactElement } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  SectionLabel,
  Text,
} from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Rigid } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  resourcesDebugEndpoint,
  type ResourceDebug,
} from "../../shared/endpoints";

// Server-fed companion to the client `ResourcesSection`: the authoritative
// server view of every registered resource's fan-out (max per-pk subscriber
// count = how many tabs each delta hits) and loader frequency (calls/min, max
// single-call ms over the profiling window). The client section shows what THIS
// tab subscribes to; this one shows the whole server's delivery cost — together
// they answer "is a cheap loader being hammered, and how wide does it fan out?".
// Default-sorted by call-rate desc so the hottest loader is on top.
//
// Composed from <Stack> rows + <Inline>, NOT a DataTable: the pane is a single
// flowing scroll column shared by every section, and DataTable pins its header
// to that shared scroll container — which overlaps the sections above it. Flow
// rows compose correctly here.

function maxFanOut(subCounts: Record<string, number>): number {
  const values = Object.values(subCounts);
  return values.length === 0 ? 0 : Math.max(...values);
}

export function ServerResourcesSection(): ReactElement {
  const { data } = useEndpoint(resourcesDebugEndpoint, {});

  const rows = useMemo<ResourceDebug[]>(() => {
    if (!data) return [];
    return [...data.resources].sort(
      (a, b) =>
        (b.loaderStats?.ratePerMin ?? 0) - (a.loaderStats?.ratePerMin ?? 0),
    );
  }, [data]);

  return (
    <Stack as="section" gap="sm">
      <SectionLabel>
        Server resources <span className="opacity-60">{rows.length}</span>
      </SectionLabel>
      {!data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Text variant="caption" tone="muted">
          No registered resources.
        </Text>
      ) : (
        <Stack gap="2xs">
          {rows.map((r) => (
            <ServerResourceRow key={r.key} r={r} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ServerResourceRow({ r }: { r: ResourceDebug }): ReactElement {
  const fanOut = maxFanOut(r.subCounts);
  return (
    <Stack direction="row" align="center" gap="sm">
      <Fill>
        <Text variant="caption">{r.key}</Text>
      </Fill>
      <Stack as={Rigid} direction="row" align="center" gap="sm">
        <Inline gap="sm">
          <Stat label="subs" value={r.subscribers} />
          {fanOut > 1 ? (
            <Badge variant="warning">×{fanOut}</Badge>
          ) : (
            <Stat label="fan" value={`×${fanOut}`} />
          )}
          <Stat
            label="/min"
            value={r.loaderStats ? Math.round(r.loaderStats.ratePerMin) : "—"}
          />
          <Stat
            label="max ms"
            value={r.loaderStats ? Math.round(r.loaderStats.maxMs) : "—"}
          />
        </Inline>
      </Stack>
    </Stack>
  );
}

// One labeled stat: a muted value with a dimmer trailing unit label.
function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): ReactElement {
  return (
    <Text as="span" variant="caption" tone="muted">
      <span className="tabular-nums">{value}</span>
      <span className="opacity-50"> {label}</span>
    </Text>
  );
}
