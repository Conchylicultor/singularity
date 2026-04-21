import { useMemo } from "react";
import { useResource } from "@core";
import type { ConversationStatus } from "@plugins/conversations/shared";
import { agentLaunchesResource } from "../../shared/resources";
import { cn } from "@/lib/utils";

const CONV_STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-primary",
  waiting: "bg-amber-500",
  gone: "bg-muted-foreground/40",
};

export function AgentStatus({ agentId, size = "sm" }: { agentId: string; size?: "sm" | "md" }) {
  const launchesQ = useResource(agentLaunchesResource);

  const status = useMemo(() => {
    const launches = launchesQ.data ?? [];
    const latest = launches
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return latest?.latestConversationStatus ?? null;
  }, [launchesQ.data, agentId]);

  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: size === "md" ? 20 : 20, height: size === "md" ? 20 : 20 }}>
      {status && (
        <span className={cn("rounded-full", size === "md" ? "size-2.5" : "size-2", CONV_STATUS_DOT[status])} />
      )}
    </span>
  );
}
