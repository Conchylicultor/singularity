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
    /**
     * Renders the step trace BODY only (below the shared chrome). The host
     * (ExecutionDetail) wraps every step in StepTraceShell, which provides the
     * uniform chrome — icon, label, status badge, timing, and error — so a body
     * component renders only its step-type-specific content.
     */
    executionComponent?: ComponentType<{
      step: WorkflowExecutionStep;
      execution: WorkflowExecution;
    }>;
  }>("workflows.step-type", { docLabel: (p) => p.label }),
};
