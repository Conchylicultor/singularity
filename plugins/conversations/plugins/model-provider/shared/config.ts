import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { DEFAULT_MODEL, MODEL_REGISTRY, SELECTABLE_MODELS } from "../core";

// SELECTABLE_MODELS already excludes print-only models (e.g. haiku), which are
// valid persisted ids but never session-selectable — so they never appear in
// the launch dropdown or these config options.
const modelEntries = SELECTABLE_MODELS.map((id) => [id, MODEL_REGISTRY[id]] as const);

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
