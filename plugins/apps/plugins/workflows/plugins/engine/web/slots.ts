import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { WorkflowExecutionStep, WorkflowExecution } from "../core";

export const Workflows = {
  StepType: defineSlot<{
    pluginId: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    configComponent?: ComponentType<{
      config: unknown;
      onChange: (config: unknown) => void;
    }>;
    executionComponent?: ComponentType<{
      step: WorkflowExecutionStep;
      execution: WorkflowExecution;
    }>;
  }>("workflows.step-type", { docLabel: (p) => p.label }),
};
