import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { secretField } from "./secret";

/**
 * The secret field's fixed gallery sample (see `FieldSample`). Outside a
 * config field (no `ConfigFieldContext`) the renderer reads no stored secret
 * and is a plain password input; the value is empty so it shows its
 * placeholder rather than browser-drawn mask dots.
 */
export const secretSample = fieldSample(
  secretField({
    label: "API key",
    description: "Used to call the provider's API.",
    placeholder: "Paste your API key",
  }),
  "",
);
