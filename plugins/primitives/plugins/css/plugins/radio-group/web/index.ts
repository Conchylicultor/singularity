import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
} from "./internal/radio-group";

export default {
  description:
    'Native radio-group control: <RadioGroup options value onChange> mints its own HTML `name` per mount (useId) so two groups on one page are structurally two groups, plus the no-adhoc-radio lint rule keeping raw <input type="radio"> out of feature code.',
  contributions: [],
} satisfies PluginDefinition;
