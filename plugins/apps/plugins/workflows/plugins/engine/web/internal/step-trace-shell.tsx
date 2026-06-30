import type { ComponentType, ReactNode } from "react";
import type { WorkflowExecutionStep } from "../../core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { StepStatusBadge } from "./step-status-badge";

/**
 * Uniform chrome for an execution step trace: icon + label + status badge,
 * timing, and error rendered identically for every step type. Each step type's
 * `executionComponent` renders only the BODY (passed as `children`).
 */
export function StepTraceShell({
  step,
  icon: Icon,
  label,
  children,
}: {
  step: WorkflowExecutionStep;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <Surface level="raised" as="div" className="p-sm">
      <Stack gap="sm">
        <Stack as="div" direction="row" align="center" justify="between" gap="sm">
          <Stack as="span" direction="row" align="center" gap="sm">
            {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
            <Text as="span" variant="body">{label}</Text>
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

        {children}
      </Stack>
    </Surface>
  );
}
