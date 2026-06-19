import { useNotificationsChannelStatuses } from "@plugins/primitives/plugins/live-state/web";
import type { WsStatus } from "@plugins/primitives/plugins/networking/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";

const STATUS_CLASS: Record<WsStatus, string> = {
  connecting: "bg-warning animate-pulse",
  open: "bg-success",
  reconnecting: "bg-warning animate-pulse",
  closed: "bg-destructive",
};

const STATUS_VERB: Record<WsStatus, string> = {
  connecting: "Connecting",
  open: "Connected",
  reconnecting: "Reconnecting",
  closed: "Disconnected",
};

function aggregateStatus(worktree: WsStatus, central: WsStatus): WsStatus {
  const vals = [worktree, central];
  if (vals.some((s) => s === "reconnecting")) return "reconnecting";
  if (vals.some((s) => s === "closed")) return "closed";
  if (vals.some((s) => s === "connecting")) return "connecting";
  return "open";
}

function tooltipLabel(worktree: WsStatus, central: WsStatus): string {
  if (worktree === "open" && central === "open") return "Connected";
  if (worktree === central) return `${STATUS_VERB[worktree]}…`;
  const parts: string[] = [];
  if (worktree !== "open") parts.push(`Server: ${STATUS_VERB[worktree]}`);
  if (central !== "open") parts.push(`Central: ${STATUS_VERB[central]}`);
  return parts.join(" · ");
}

export function HealthDot() {
  const { worktree, central } = useNotificationsChannelStatuses();
  const aggregate = aggregateStatus(worktree, central);

  return (
    <WithTooltip content={tooltipLabel(worktree, central)}>
      <Center className="size-8 cursor-default">
        <StatusDot size="md" colorClass={STATUS_CLASS[aggregate]} />
      </Center>
    </WithTooltip>
  );
}
