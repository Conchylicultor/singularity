import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Steps,
  Step,
  StepLink,
  StepDone,
  type StepProps,
  type StepState,
} from "./internal/steps";

export default {
  description:
    "Guided setup-flow primitive: <Steps> ordered container auto-numbering <Step> items (upcoming/active/done states, dimmed-and-inert future steps, check-on-done, connecting rail), plus StepLink (open-external) and StepDone (success line) affordances.",
  contributions: [],
} satisfies PluginDefinition;
