import { defineConfig } from "@plugins/config/core";

export const buildConfig = defineConfig({
  autoBuild: {
    default: true,
    label: "Auto-build on push",
    description:
      "Automatically run ./singularity build when a new push to main is detected.",
  },
});
