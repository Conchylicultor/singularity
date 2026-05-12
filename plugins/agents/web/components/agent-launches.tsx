import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { agentLaunchesResource } from "../../shared/resources";
import { agentConversationPane } from "../panes";
import { cn } from "@/lib/utils";

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentLaunches({ agentId }: { agentId: string }) {
  const launchesQ = useResource(agentLaunchesResource);
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const activeConvId = match?.chain.find(
    (e) => e.pane === agentConversationPane._internal,
  )?.params.convId;

  const launches = useMemo(() => {
    const rows = launchesQ.data;
    return rows
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [launchesQ.data, agentId]);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Attempts
      </h3>
      {launches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No attempts yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {launches.map((launch) => {
            const primary = launch.latestConversation;
            const isActive = primary ? activeConvId === primary.id : false;
            const title = primary?.title ?? `Launch ${formatDate(launch.createdAt)}`;
            return (
              <li key={launch.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!primary) return;
                    if (isActive) {
                      agentConversationPane.close();
                    } else {
                      openPane(agentConversationPane, {
                        id: agentId,
                        convId: primary.id,
                      });
                    }
                  }}
                  disabled={!primary}
                  className={cn(
                    "flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm",
                    primary ? "hover:bg-accent" : "opacity-60",
                    isActive && "bg-accent",
                  )}
                >
                  {primary ? (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        CONV_STATUS_DOT[primary.status],
                      )}
                    />
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  )}
                  <span className="flex-1 truncate">{title}</span>
                  {primary ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {primary.status}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatDate(launch.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
