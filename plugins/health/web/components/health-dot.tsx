import { useEffect, useState } from "react";
import { subscribeWsStatus, type WsStatus } from "@plugins/primitives/plugins/networking/web";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type OverallStatus = "connecting" | "open" | "reconnecting" | "closed";

function computeOverall(statuses: Map<string, WsStatus>): OverallStatus {
  if (statuses.size === 0) return "connecting";
  const vals = [...statuses.values()];
  if (vals.some((s) => s === "reconnecting")) return "reconnecting";
  if (vals.some((s) => s === "closed")) return "closed";
  if (vals.some((s) => s === "connecting")) return "connecting";
  return "open";
}

const DOT_CONFIG: Record<OverallStatus, { className: string; label: string }> = {
  connecting: { className: "bg-yellow-400 animate-pulse", label: "Connecting…" },
  open: { className: "bg-green-500", label: "Connected" },
  reconnecting: { className: "bg-yellow-500 animate-pulse", label: "Reconnecting…" },
  closed: { className: "bg-red-500", label: "Disconnected" },
};

export function HealthDot() {
  const [statuses, setStatuses] = useState<Map<string, WsStatus>>(new Map());

  useEffect(() => {
    return subscribeWsStatus(({ url, status }) => {
      setStatuses((prev) => new Map(prev).set(url, status));
    });
  }, []);

  const config = DOT_CONFIG[computeOverall(statuses)];

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
