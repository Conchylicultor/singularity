import type { JobCtx } from "@plugins/infra/plugins/jobs/server";
import type { Registration } from "@plugins/framework/plugins/server-core/core";

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
  /**
   * The value this step emits into the next step's input. **Omit the key
   * entirely to make the step transparent** — its input flows through unchanged
   * (the right default for pure routing or side-effect steps like `branch`).
   * Setting `output` explicitly — even to `null` — overwrites the pipeline
   * value. (Absent key vs. `null` value are deliberately different.)
   */
  output?: unknown;
  /** Routing key; selects `nextStepMapping[branchKey]` over the default `next`. */
  branchKey?: string;
  /**
   * Set by a suspending step (e.g. `user-input`) when its bounded wait elapsed
   * with no event — a normal *business* outcome, not an error. run-job lands the
   * step + execution in the terminal `expired` state on the normal post-exec
   * path (no throw → no graphile retry storm).
   */
  expired?: true;
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
