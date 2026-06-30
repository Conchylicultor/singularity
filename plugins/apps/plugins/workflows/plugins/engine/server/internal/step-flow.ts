import type { DefinitionStep } from "../../core";
import type { StepResult } from "./executor-registry";

/**
 * Resolve the value that flows out of a step into the next one's input.
 *
 * A step is *transparent* when it returns no `output` key at all (pure routing
 * or side-effect steps like `branch`): the pipeline value carries through
 * unchanged. A step that sets `output` explicitly — even to `null` — overwrites
 * the pipeline value. This distinction (key absent vs. value null) is what keeps
 * routing from severing the data flowing through the workflow.
 */
export function resolveStepOutput(prevOutput: unknown, result: StepResult): unknown {
  return "output" in result ? result.output : prevOutput;
}

/**
 * Resolve the id of the next step to run. A `branchKey` that matches an entry in
 * the step's `nextStepMapping` routes there; otherwise the step's default `next`
 * edge is followed. Returns `null` when the workflow has no further step.
 */
export function resolveNextStepId(
  stepDef: DefinitionStep,
  result: StepResult,
): string | null {
  if (result.branchKey && stepDef.nextStepMapping?.[result.branchKey]) {
    return stepDef.nextStepMapping[result.branchKey] ?? null;
  }
  return stepDef.next;
}
