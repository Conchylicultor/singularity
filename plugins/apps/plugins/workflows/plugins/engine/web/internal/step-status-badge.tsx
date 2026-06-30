import type { ExecutionStepStatus } from "../../core";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

const styles: Record<ExecutionStepStatus, { bg: string; label: string }> = {
  pending: { bg: "bg-muted-foreground", label: "Pending" },
  running: { bg: "bg-info", label: "Running" },
  suspended: { bg: "bg-warning", label: "Suspended" },
  completed: { bg: "bg-success", label: "Completed" },
  failed: { bg: "bg-destructive", label: "Failed" },
  skipped: { bg: "bg-muted-foreground", label: "Skipped" },
  cancelled: { bg: "bg-muted-foreground", label: "Cancelled" },
  expired: { bg: "bg-warning", label: "Expired" },
};

export function StepStatusBadge({ status }: { status: ExecutionStepStatus }) {
  const { bg, label } = styles[status];
  return (
    <Stack as="span" direction="row" align="center" gap="xs">
      <StatusDot colorClass={bg} className="inline-block" />
      <Text as="span" variant="caption">{label}</Text>
    </Stack>
  );
}
