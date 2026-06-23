import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { useStaleFrontend } from "@plugins/build/web";
import { reportsResource } from "@plugins/reports/core";
import type { Report } from "@plugins/reports/core";
import { Reports } from "@plugins/reports/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export function ReportsView({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const result = useResource(reportsResource);
  const { serverBuildId } = useStaleFrontend();

  if (result.pending) return <Loading />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <ControlSizeProvider size="xs">
        <Center className="h-full">
          <Text as="div" variant="body" className="text-muted-foreground">
            No reports recorded yet.
          </Text>
        </Center>
      </ControlSizeProvider>
    );
  }

  return (
    <ControlSizeProvider size="xs">
      <Stack gap="none" className="h-full">
        <Scroll axis="both" fill>
          <ul className="divide-y">
            {rows.map((c: Report) => (
              <ReportRow
                key={c.id}
                report={c}
                serverBuildId={serverBuildId}
                selected={c.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </Scroll>
      </Stack>
    </ControlSizeProvider>
  );
}

function ReportRow({
  report: c,
  serverBuildId,
  selected,
  onSelect,
}: {
  report: Report;
  serverBuildId: string | null;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const tabId = getTabId();
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? true : undefined}
        onClick={() => onSelect(c.id)}
        className={cn(
          "w-full px-md py-sm text-left transition-colors",
          selected ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <Stack gap="xs">
          <Text as="div" variant="caption">
            <Cluster>
              <Badge variant="muted" className="font-mono">
                {c.kind}
              </Badge>
              <Badge variant="muted" className="font-mono">
                {c.source}
              </Badge>
              {c.noise && <Badge variant="warning">noise</Badge>}
              {c.rateLimited && <Badge variant="destructive">rate-limited</Badge>}
              {c.lastClientId != null &&
                (c.lastClientId === tabId ? (
                  <Badge variant="info">this tab</Badge>
                ) : (
                  <Badge variant="muted">another tab</Badge>
                ))}
              {c.lastBuildId != null &&
                serverBuildId != null &&
                c.lastBuildId !== serverBuildId && (
                  <Badge variant="warning">outdated tab</Badge>
                )}
              {c.count > 1 && (
                <span className="tabular-nums text-muted-foreground">×{c.count}</span>
              )}
              <span className="text-muted-foreground">
                <RelativeTime date={c.lastSeenAt} />
              </span>
            </Cluster>
          </Text>
          <Text as="div" variant="body" className="truncate text-foreground">
            {/* Per-kind summary, dispatched by report.kind. */}
            <Reports.KindView.Dispatch report={c} />
          </Text>
        </Stack>
      </button>
    </li>
  );
}
