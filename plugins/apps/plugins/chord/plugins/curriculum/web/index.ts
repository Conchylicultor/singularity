import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useCurriculum,
  useNextStep,
  useUndoStep,
  useUnlockStep,
} from "./internal/use-curriculum";
export type { NextStepRead, StepWrite } from "./internal/use-curriculum";
export { stepReadiness } from "./internal/readiness";
export type { StepReadiness } from "./internal/readiness";
export { NextStepPad } from "./components/next-step-pad";
export { NextStepRow } from "./components/next-step-row";

export default {
  description:
    "The curriculum's browser half: useCurriculum (the live chord.curriculum standing), useNextStep (the step on offer, re-read after every write), useUnlockStep / useUndoStep (the two writes, whose conflicts surface as a toast), and the two places the locked next step shows — <NextStepPad>, the ghost chord button at the end of the grid, and <NextStepRow>, the panel row that draws every kind of step.",
  contributions: [],
} satisfies PluginDefinition;
