import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  deleteExecution,
  type WorkflowExecution,
  type WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { useStepTypeIndex } from "../internal/use-step-type-index";
import { ExecutionStatusBadge } from "./execution-status-badge";
import { StepStatusBadge } from "./step-status-badge";

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
              const Exec = stepTypes.get(step.stepPluginId)?.executionComponent;
              return (
                <PluginErrorBoundary key={step.id} label={`workflow step ${step.label}`}>
                  {Exec ? (
                    <Exec step={step} execution={execution} />
                  ) : (
                    <GenericStepTrace step={step} />
                  )}
                </PluginErrorBoundary>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

function GenericStepTrace({ step }: { step: WorkflowExecutionStep }) {
  const stepTypes = useStepTypeIndex();
  const Icon = stepTypes.get(step.stepPluginId)?.icon;
  const typeLabel = stepTypes.get(step.stepPluginId)?.label;

  return (
    <Surface level="raised" as="div" className="p-sm">
      <Stack gap="sm">
        <Stack as="div" direction="row" align="center" justify="between" gap="sm">
          <Stack as="span" direction="row" align="center" gap="sm">
            {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
            <Text as="span" variant="body">{step.label || typeLabel || step.stepPluginId}</Text>
          </Stack>
          <StepStatusBadge status={step.status} />
        </Stack>

        {step.startedAt || step.completedAt ? (
          <Stack as="div" direction="row" gap="md" className="text-muted-foreground">
            {step.startedAt ? (
              <Text as="span" variant="caption">
                Started <RelativeTime date={new Date(step.startedAt)} />
              </Text>
            ) : null}
            {step.completedAt ? (
              <Text as="span" variant="caption">
                Completed <RelativeTime date={new Date(step.completedAt)} />
              </Text>
            ) : null}
          </Stack>
        ) : null}

        {step.error ? (
          <Text as="div" variant="caption" className="text-destructive">
            {step.error}
          </Text>
        ) : null}

        {step.input != null ? <JsonBlock label="Input" value={step.input} /> : null}
        {step.output != null ? <JsonBlock label="Output" value={step.output} /> : null}
      </Stack>
    </Surface>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <Collapsible className="py-2xs">
      <CollapsibleTrigger className="gap-xs">
        <CollapsibleChevron className="size-4 text-muted-foreground" />
        <Text as="span" variant="caption" className="text-muted-foreground">{label}</Text>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* eslint-disable-next-line layout/no-adhoc-layout -- horizontal scroll for the raw JSON code preview; not a layout container */}
        <pre className="text-caption overflow-x-auto rounded-md bg-muted p-sm text-muted-foreground">
          {JSON.stringify(value, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
