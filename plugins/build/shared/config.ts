import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const buildConfig = defineConfig({
  fields: {
    autoBuild: boolField({
      default: true,
      label: "Auto-build on push",
      description:
        "Automatically run ./singularity build when a new push to main is detected.",
    }),
  },
});
