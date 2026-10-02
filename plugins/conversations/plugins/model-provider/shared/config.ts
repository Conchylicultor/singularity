import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { dynamicFlagsField } from "@plugins/fields/plugins/dynamic-flags/plugins/config/core";
import { DEFAULT_MODEL_CHOICE } from "../core";

// Neither field lists a model: the options are the LIVE catalog's, contributed
// at render time by this plugin's web barrel (`DynamicEnum.Options` /
// `DynamicFlags.Options`), so a release changes no config file — not the
// origin, not a saved override. Reads go through the model-aware readers
// (`normalizeModelChoice`, `isChoiceVisible`), never the raw values.

export const modelProviderConfig = defineConfig({
  fields: {
    defaultModel: dynamicEnumField({
      label: "Default model",
      description:
        'Model fired by the launch button and pre-selected in the dropdown. A family ("opus") always runs its newest version.',
      default: DEFAULT_MODEL_CHOICE,
    }),
    // A free-key record: an absent key is the choice's default (families on,
    // pinned versions off — `isShownByDefault`), so saved files written when
    // this was a fixed object of every model still load unchanged.
    visibleModels: dynamicFlagsField({
      label: "Models shown in the launch dropdown",
    }),
  },
});
