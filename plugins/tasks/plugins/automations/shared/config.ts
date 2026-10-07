import { defineConfig } from "@plugins/config_v2/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { stringListField } from "@plugins/fields/plugins/string-list/plugins/config/core";
import { DEFAULT_MODEL_CHOICE } from "@plugins/conversations/plugins/model-provider/core";

// The person's settings, one item per automation they changed. An automation
// with no item runs on the defaults it declares, so adding an automation never
// changes a saved file. An item is complete: it replaces the defaults as a
// whole (`resolveAutomationSettings`), so the Automations pane writes every
// field when it first writes one. The field defaults below only heal an item
// written before a field existed.
export const automationsConfig = defineConfig({
  fields: {
    settings: listField({
      label: "Automation settings",
      description:
        "How each automation behaves. An automation with no entry here runs on its own defaults.",
      itemFields: {
        automationId: textField({ label: "Automation" }),
        enabled: boolField({ label: "Enabled", default: true }),
        autoPush: boolField({ label: "Push when checks pass" }),
        // A model CHOICE (a family runs its newest version), read back through
        // `normalizeModelChoice`.
        model: dynamicEnumField({
          label: "Model",
          default: DEFAULT_MODEL_CHOICE,
        }),
        excludedSources: stringListField({ label: "Excluded sources" }),
      },
      default: [],
    }),
  },
});
