import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  ValueBlock,
  CollapsibleValue,
} from "@plugins/apps/plugins/workflows/plugins/engine/web";
import type {
  WorkflowExecution,
  WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * Execution body for the template step: the rendered result plus the input it
 * was rendered against.
 */
export function TemplateExecution({
  step,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Rendered</Text>
        <ValueBlock value={step.output} />
      </Stack>
      <CollapsibleValue label="Input" value={step.input} />
    </Stack>
  );
}
