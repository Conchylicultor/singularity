import type { JobCtx } from "@plugins/infra/plugins/jobs/server";
import type { Registration } from "@server/types";

export interface StepExecutorRunArgs {
  execution: { id: string; definitionId: string };
  step: {
    id: string;
    definitionStepId: string;
    stepPluginId: string;
    label: string;
    config: unknown;
    next: string | null;
    nextStepMapping: Record<string, string> | null;
    input: unknown;
  };
  ctx: JobCtx;
}

export interface StepResult {
  output?: unknown;
  branchKey?: string;
}

export interface StepExecutorSpec {
  pluginId: string;
  run: (args: StepExecutorRunArgs) => Promise<StepResult>;
}

const executorRegistry = new Map<string, StepExecutorSpec>();

export function defineStepExecutor(spec: StepExecutorSpec): Registration {
  return {
    _kind: "step-executor",
    _factory: "defineStepExecutor",
    _doc: { label: spec.pluginId },
    register() {
      executorRegistry.set(spec.pluginId, spec);
    },
  };
}

export function getExecutor(pluginId: string): StepExecutorSpec | undefined {
  return executorRegistry.get(pluginId);
}
