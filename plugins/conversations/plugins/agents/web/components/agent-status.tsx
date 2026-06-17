import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { agentLaunchesResource } from "../../shared/resources";

export function AgentStatus({ agentId, size = "sm" }: { agentId: string; size?: "sm" | "md" }) {
  const launchesQ = useResource(agentLaunchesResource);

  // No status while loading is correct — we don't know the latest status yet.
  if (launchesQ.pending) {
    return (
      <span className="flex shrink-0 items-center justify-center" style={{ width: 20, height: 20 }} />
    );
  }

  const latest = launchesQ.data
    .filter((l) => l.agentId === agentId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const status = latest?.latestConversationStatus ?? null;

  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: 20, height: 20 }}>
      {status && (
        <StatusDot colorClass={CONV_STATUS_DOT[status]} size={size === "md" ? "lg" : "md"} />
      )}
    </span>
  );
}
