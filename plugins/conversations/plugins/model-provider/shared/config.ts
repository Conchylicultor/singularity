import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/config_v2/plugins/fields/plugins/enum/core";

export const modelProviderConfig = defineConfig({
  fields: {
    opusVersion: enumField({
      label: "Opus version",
      description: "Claude Opus model version for new conversations.",
      options: [
        { value: "4-6", label: "Opus 4.6" },
        { value: "4-7", label: "Opus 4.7" },
      ],
      default: "4-6",
    }),
  },
});
