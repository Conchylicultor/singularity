import { useNotificationsStatus } from "@plugins/primitives/plugins/live-state/web";
import type { WsStatus } from "@plugins/primitives/plugins/networking/web";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DOT_CONFIG: Record<WsStatus, { className: string; label: string }> = {
  connecting: { className: "bg-yellow-400 animate-pulse", label: "Connecting…" },
  open: { className: "bg-green-500", label: "Connected" },
  reconnecting: { className: "bg-yellow-500 animate-pulse", label: "Reconnecting…" },
  closed: { className: "bg-red-500", label: "Disconnected" },
};

export function HealthDot() {
  const status = useNotificationsStatus();
  const config = DOT_CONFIG[status];

  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex items-center justify-center size-8 cursor-default" />}
      >
        <div className={`size-2 rounded-full ${config.className}`} />
      </TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  );
}
