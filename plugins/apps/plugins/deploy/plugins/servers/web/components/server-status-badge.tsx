import type { ServerStatus } from "../../shared";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const styles: Record<ServerStatus, { bg: string; label: string }> = {
  online: { bg: "bg-success", label: "Online" },
  offline: { bg: "bg-destructive", label: "Offline" },
  unknown: { bg: "bg-muted-foreground", label: "Unknown" },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const { bg, label } = styles[status];
  return (
    <Text as="span" variant="caption" className="flex items-center gap-xs">
      <StatusDot colorClass={bg} size="md" className="inline-block" />
      {label}
    </Text>
  );
}
