import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  deleteExecution,
  type WorkflowExecution,
  type WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import {
  useStepTypeIndex,
  StepTraceShell,
  CollapsibleValue,
} from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { ExecutionStatusBadge } from "./execution-status-badge";

const CANCELLABLE = new Set(["pending", "running", "suspended"]);

export function ExecutionDetail({ execution }: { execution: WorkflowExecution }) {
  const stepTypes = useStepTypeIndex();
  const steps = [...execution.steps].sort((a, b) => a.executionOrder - b.executionOrder);

  async function handleCancel() {
    if (!confirm("Cancel this execution?")) return;
    await fetchEndpoint(deleteExecution, { id: execution.id });
  }

  return (
    <Stack gap="lg" className="p-lg">
      <Stack direction="row" align="start" justify="between" gap="md">
        <Stack gap="xs">
          <ExecutionStatusBadge status={execution.status} />
          <Stack as="div" direction="row" gap="md" className="text-muted-foreground">
            <Text as="span" variant="caption">
              Created <RelativeTime date={new Date(execution.createdAt)} />
            </Text>
            {execution.completedAt ? (
              <Text as="span" variant="caption">
                Completed <RelativeTime date={new Date(execution.completedAt)} />
              </Text>
            ) : null}
          </Stack>
        </Stack>
        {CANCELLABLE.has(execution.status) ? (
          <Button
            variant="link"
            onClick={handleCancel}
            className="text-destructive hover:text-destructive"
          >
            Cancel
          </Button>
        ) : null}
      </Stack>

      <Stack gap="sm">
        <Text as="h2" variant="label">Steps</Text>
        {steps.length === 0 ? (
          <Text as="div" variant="body" className="text-muted-foreground">
            No steps ran.
          </Text>
        ) : (
          <Stack gap="xs">
            {steps.map((step) => {
              const type = stepTypes.get(step.stepPluginId);
              const Body = type?.executionComponent;
              return (
                <PluginErrorBoundary key={step.id} label={`workflow step ${step.label}`}>
                  <StepTraceShell
                    step={step}
                    icon={type?.icon}
                    label={step.label || type?.label || step.stepPluginId}
                  >
                    {Body ? (
                      <Body step={step} execution={execution} />
                    ) : (
                      <GenericStepBody step={step} />
                    )}
                  </StepTraceShell>
                </PluginErrorBoundary>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

function GenericStepBody({ step }: { step: WorkflowExecutionStep }) {
  if (step.input == null && step.output == null) return null;
  return (
    <Stack gap="2xs">
      {step.input != null ? <CollapsibleValue label="Input" value={step.input} /> : null}
      {step.output != null ? <CollapsibleValue label="Output" value={step.output} /> : null}
    </Stack>
  );
}
