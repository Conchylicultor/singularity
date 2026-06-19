import type { ServerStatus } from "../../shared";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

const styles: Record<ServerStatus, { bg: string; label: string }> = {
  online: { bg: "bg-success", label: "Online" },
  offline: { bg: "bg-destructive", label: "Offline" },
  unknown: { bg: "bg-muted-foreground", label: "Unknown" },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const { bg, label } = styles[status];
  return (
    <Stack as="span" direction="row" align="center" gap="xs">
      <StatusDot colorClass={bg} size="md" className="inline-block" />
      <Text as="span" variant="caption">{label}</Text>
    </Stack>
  );
}
