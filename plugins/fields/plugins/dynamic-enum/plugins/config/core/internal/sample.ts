import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { dynamicEnumField } from "./dynamic-enum";

/**
 * The dynamic-enum field's fixed gallery sample (see `FieldSample`). Its option
 * set is contributed with it (a fixed `DynamicEnum.Options` from this plugin's
 * web barrel), so it renders as the resolved picker, deterministically.
 */
export const dynamicEnumSample = fieldSample(
  dynamicEnumField({
    label: "Default model",
    description: "The model a new agent starts with.",
  }),
  "sonnet",
);

const OPTIONS = Object.freeze([
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
]);

/** The options the sample's picker resolves to — fixed, so it calls no React hook. */
export function useDynamicEnumSampleOptions(): readonly {
  readonly value: string;
  readonly label: string;
}[] {
  return OPTIONS;
}
