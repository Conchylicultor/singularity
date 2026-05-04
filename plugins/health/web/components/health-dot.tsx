import { useNotificationsChannelStatuses } from "@plugins/primitives/plugins/live-state/web";
import type { WsStatus } from "@plugins/primitives/plugins/networking/web";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_CLASS: Record<WsStatus, string> = {
  connecting: "bg-yellow-400 animate-pulse",
  open: "bg-green-500",
  reconnecting: "bg-yellow-500 animate-pulse",
  closed: "bg-red-500",
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
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex items-center justify-center size-8 cursor-default" />}
      >
        <div className={`size-2 rounded-full ${STATUS_CLASS[aggregate]}`} />
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel(worktree, central)}</TooltipContent>
    </Tooltip>
  );
}
