import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/config_v2/plugins/fields/plugins/enum/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { boolField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { DEFAULT_MODEL, MODEL_REGISTRY } from "../core";

// Print-only models (e.g. haiku) are valid persisted ids but are not session-selectable,
// so they must never appear in the launch dropdown or config options.
const modelEntries = Object.entries(MODEL_REGISTRY).filter(([, m]) => !m.printOnly);

export const modelProviderConfig = defineConfig({
  fields: {
    defaultModel: enumField({
      label: "Default model",
      description: "Model fired by the launch button and pre-selected in the dropdown.",
      options: modelEntries.map(([value, m]) => ({ value, label: m.label })),
      default: DEFAULT_MODEL,
    }),
    visibleModels: objectField({
      label: "Models shown in the launch dropdown",
      subFields: Object.fromEntries(
        modelEntries.map(([id, m]) => [id, boolField({ label: m.label, default: !m.defaultHidden })]),
      ),
    }),
  },
});
