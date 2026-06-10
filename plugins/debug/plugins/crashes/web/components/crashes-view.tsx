import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { useStaleFrontend } from "@plugins/build/web";
import { crashesResource } from "@plugins/crashes/core";
import type { Crash } from "@plugins/crashes/core";

function navigateTo(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

export function CrashesView() {
  const result = useResource(crashesResource);
  const { serverBuildId } = useStaleFrontend();
  const rows = result.pending ? [] : result.data;

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No crashes recorded yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <ul className="divide-y">
          {rows.map((c: Crash) => (
            <CrashRow key={c.id} crash={c} serverBuildId={serverBuildId} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CrashRow({ crash: c, serverBuildId }: { crash: Crash; serverBuildId: string | null }) {
  const line = c.errorType ? `${c.errorType}: ${c.message}` : c.message;
  const tabId = getTabId();
  return (
    <li className="px-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="muted" size="md" className="font-mono">
            {c.source}
          </Badge>
          {c.noise && (
            <Badge variant="warning" size="md">
              noise
            </Badge>
          )}
          {c.crashLoop && (
            <Badge variant="destructive" size="md">
              loop
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
              onClick={() => navigateTo(`/tasks/t/${c.taskId}`)}
            >
              task →
            </button>
          )}
        </div>
        <div className="truncate text-sm text-foreground">{line}</div>
      </div>
    </li>
  );
}
