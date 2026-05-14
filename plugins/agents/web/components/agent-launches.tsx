import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { agentLaunchesResource } from "@plugins/agents/shared/resources";
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
  const openPane = useOpenPane();
  const convEntry = conversationPane.useChainEntry();
  const activeConvId = convEntry?.params.convId;

  const launches = useMemo(() => {
    const rows = launchesQ.data;
    return rows
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [launchesQ.data, agentId]);

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel as="h3" className="font-medium">
        Attempts
      </SectionLabel>
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
                    if (isActive && convEntry) {
                      conversationPane.close(convEntry.instanceId);
                    } else {
                      openPane(conversationPane, {
                        convId: primary.id,
                      }, { mode: "push" });
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
                    <StatusDot colorClass={CONV_STATUS_DOT[primary.status]} />
                  ) : (
                    <StatusDot colorClass="bg-muted-foreground/40" />
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
