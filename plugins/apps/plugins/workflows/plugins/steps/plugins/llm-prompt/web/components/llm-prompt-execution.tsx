import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  ValueBlock,
  CollapsibleValue,
} from "@plugins/apps/plugins/workflows/plugins/engine/web";
import type {
  WorkflowExecution,
  WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * Execution body for the llm-prompt step: the model tier, the generated text,
 * and the prompt / system prompt it ran.
 */
export function LlmPromptExecution({
  step,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  const out = step.output as { text?: string } | null;
  const config = (step.config ?? {}) as {
    tier?: string;
    system?: string;
    prompt?: string;
  };

  return (
    <Stack gap="sm">
      <Stack as="div" direction="row" align="center" gap="xs">
        <Badge>{config.tier ?? "haiku"}</Badge>
      </Stack>

      {out?.text ? (
        <Stack gap="2xs">
          <Text variant="caption" tone="muted">Generated</Text>
          <ValueBlock value={out.text} />
        </Stack>
      ) : null}

      <CollapsibleValue label="Prompt" value={config.prompt} />
      {config.system ? <CollapsibleValue label="System" value={config.system} /> : null}
    </Stack>
  );
}
