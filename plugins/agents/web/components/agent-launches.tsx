import { useMemo } from "react";
import { useResource } from "@core";
import { ShellCommands } from "@plugins/shell/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { conversationsResource } from "@plugins/conversations/shared";
import type { Conversation } from "@plugins/conversations/shared";
import { agentLaunchesResource, type AgentLaunch } from "../../shared/resources";
import { cn } from "@/lib/utils";
import { useConversationPane } from "./conversation-pane-context";

const CONV_STATUS_DOT: Record<Conversation["status"], string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-primary",
  waiting: "bg-amber-500",
  gone: "bg-muted-foreground/40",
};

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
  const convQ = useResource(conversationsResource);
  const convPane = useConversationPane();

  const launches = useMemo(() => {
    const rows = (launchesQ.data ?? []) as AgentLaunch[];
    return rows
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [launchesQ.data, agentId]);

  const conversationsByTask = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of (convQ.data ?? []) as Conversation[]) {
      if (!c.taskId) continue;
      const list = map.get(c.taskId);
      if (list) list.push(c);
      else map.set(c.taskId, [c]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return map;
  }, [convQ.data]);

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
            const convs = conversationsByTask.get(launch.taskId) ?? [];
            const primary = convs[0] ?? null;
            const isActive = primary && convPane?.activeId === primary.id;
            const title = primary?.title ?? `Launch ${formatDate(launch.createdAt)}`;
            return (
              <li key={launch.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!primary) return;
                    if (convPane) {
                      convPane.open(primary.id);
                    } else {
                      ShellCommands.OpenPane(
                        conversationPane({ session_id: primary.id }),
                      );
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
