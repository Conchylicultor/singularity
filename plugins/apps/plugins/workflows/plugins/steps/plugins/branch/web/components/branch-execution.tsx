import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ValueBlock } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { getByPath } from "@plugins/apps/plugins/workflows/plugins/steps/plugins/templating/core";
import type {
  WorkflowExecution,
  WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * Execution body for the branch step: the routing field, the value read from
 * the input, and which branch the execution was routed to.
 */
export function BranchExecution({
  step,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  const config = (step.config ?? {}) as { field?: string; defaultBranch?: string };
  const value = config.field ? getByPath(step.input, config.field) : undefined;
  const branchKey = value != null ? String(value) : config.defaultBranch;
  const target =
    (branchKey != null ? step.nextStepMapping?.[branchKey] : undefined) ?? null;

  return (
    <Stack gap="xs">
      <Stack as="div" direction="row" align="center" gap="xs">
        <Text variant="caption" tone="muted">Field</Text>
        <Badge mono>{config.field ?? "—"}</Badge>
      </Stack>

      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Value</Text>
        <ValueBlock value={value ?? null} />
      </Stack>

      <Stack as="div" direction="row" align="center" gap="xs">
        <Text variant="caption" tone="muted">Routed</Text>
        {target ? (
          <Stack as="span" direction="row" align="center" gap="xs">
            <Badge mono>{branchKey}</Badge>
            <Text variant="caption">→ {target}</Text>
          </Stack>
        ) : (
          <Text variant="caption" tone="muted">default next</Text>
        )}
      </Stack>
    </Stack>
  );
}
