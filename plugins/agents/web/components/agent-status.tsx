import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { agentLaunchesResource } from "../../shared/resources";

export function AgentStatus({ agentId, size = "sm" }: { agentId: string; size?: "sm" | "md" }) {
  const launchesQ = useResource(agentLaunchesResource);

  const status = useMemo(() => {
    const launches = launchesQ.data;
    const latest = launches
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return latest?.latestConversationStatus ?? null;
  }, [launchesQ.data, agentId]);

  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: size === "md" ? 20 : 20, height: size === "md" ? 20 : 20 }}>
      {status && (
        <StatusDot colorClass={CONV_STATUS_DOT[status]} size={size === "md" ? "lg" : "md"} />
      )}
    </span>
  );
}
