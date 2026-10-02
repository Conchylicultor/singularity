import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { dynamicFlagsField } from "./dynamic-flags";

/**
 * The dynamic-flags field's fixed gallery sample (see `FieldSample`). Its
 * option set is contributed with it (a fixed `DynamicFlags.Options` from this
 * plugin's web barrel), so it renders as the resolved chips, deterministically.
 */
export const dynamicFlagsSample = fieldSample(
  dynamicFlagsField({
    label: "Visible models",
    description: "Models offered in the model picker.",
  }),
  { haiku: false },
);

const OPTIONS = Object.freeze([
  { value: "opus", label: "Opus", defaultOn: true },
  { value: "sonnet", label: "Sonnet", defaultOn: true },
  { value: "haiku", label: "Haiku", defaultOn: true },
]);

/** The options the sample's chips resolve to (each on unless set) — fixed, so it calls no React hook. */
export function useDynamicFlagsSampleOptions(): readonly {
  readonly value: string;
  readonly label: string;
  readonly defaultOn: boolean;
}[] {
  return OPTIONS;
}
