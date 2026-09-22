import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import {
  DEFAULT_MODEL_CHOICE,
  SELECTABLE_CHOICES,
  choiceHint,
  choiceLabel,
  isModelFamily,
} from "../core";

// "Opus · 5.5" for a family (the version it runs today), "Opus 5" for a pinned
// version. SELECTABLE_CHOICES already excludes print-only models (haiku).
function optionLabel(choice: (typeof SELECTABLE_CHOICES)[number]): string {
  const hint = choiceHint(choice);
  return hint ? `${choiceLabel(choice)} · ${hint}` : choiceLabel(choice);
}

export const modelProviderConfig = defineConfig({
  fields: {
    defaultModel: enumField({
      label: "Default model",
      description:
        'Model fired by the launch button and pre-selected in the dropdown. A family ("opus") always runs its newest version.',
      options: SELECTABLE_CHOICES.map((value) => ({
        value,
        label: optionLabel(value),
      })),
      default: DEFAULT_MODEL_CHOICE,
    }),
    visibleModels: objectField({
      label: "Models shown in the launch dropdown",
      // Families are on by default; a pinned version is off until the user
      // turns it on — pinning is a deliberate choice, never the default.
      subFields: Object.fromEntries(
        SELECTABLE_CHOICES.map((choice) => [
          choice,
          boolField({
            label: optionLabel(choice),
            default: isModelFamily(choice),
          }),
        ]),
      ),
    }),
  },
});
