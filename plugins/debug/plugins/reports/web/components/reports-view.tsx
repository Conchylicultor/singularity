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
import { navigate } from "@plugins/apps/web";

export function ReportsView() {
  const result = useResource(reportsResource);
  const { serverBuildId } = useStaleFrontend();

  if (result.pending) return <Loading />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <Text as="div" variant="body" className="flex h-full items-center justify-center text-muted-foreground">
        No reports recorded yet.
      </Text>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <ul className="divide-y">
          {rows.map((c: Report) => (
            <ReportRow key={c.id} report={c} serverBuildId={serverBuildId} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReportRow({ report: c, serverBuildId }: { report: Report; serverBuildId: string | null }) {
  const tabId = getTabId();
  return (
    <li className="px-md py-sm">
      <div className="flex min-w-0 flex-col gap-xs">
        <Text as="div" variant="caption" className="flex flex-wrap items-center gap-sm">
          <Badge variant="muted" size="md" className="font-mono">
            {c.kind}
          </Badge>
          <Badge variant="muted" size="md" className="font-mono">
            {c.source}
          </Badge>
          {c.noise && (
            <Badge variant="warning" size="md">
              noise
            </Badge>
          )}
          {c.rateLimited && (
            <Badge variant="destructive" size="md">
              rate-limited
            </Badge>
          )}
          {c.lastClientId != null &&
            (c.lastClientId === tabId ? (
              <Badge variant="info" size="md">
                this tab
              </Badge>
            ) : (
              <Badge variant="muted" size="md">
                another tab
              </Badge>
            ))}
          {c.lastBuildId != null &&
            serverBuildId != null &&
            c.lastBuildId !== serverBuildId && (
              <Badge variant="warning" size="md">
                outdated tab
              </Badge>
            )}
          {c.count > 1 && (
            <span className="tabular-nums text-muted-foreground">×{c.count}</span>
          )}
          <span className="text-muted-foreground">
            <RelativeTime date={c.lastSeenAt} />
          </span>
          {c.taskId && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => navigate(`/tasks/t/${c.taskId}`)}
            >
              task →
            </button>
          )}
        </Text>
        <Text as="div" variant="body" className="truncate text-foreground">
          {/* Per-kind summary, dispatched by report.kind. */}
          <Reports.KindView.Dispatch report={c} />
        </Text>
      </div>
    </li>
  );
}
