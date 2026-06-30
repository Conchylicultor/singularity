import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ValueBlock } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import type {
  WorkflowExecution,
  WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * Execution body for the set-value step: the constant seed it emitted as output.
 */
export function SetValueExecution({
  step,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  return (
    <Stack gap="2xs">
      <Text variant="caption" tone="muted">Value</Text>
      <ValueBlock value={step.output} />
    </Stack>
  );
}
