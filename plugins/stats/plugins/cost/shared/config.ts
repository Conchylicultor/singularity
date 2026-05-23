import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const costConfig = defineConfig({
  fields: {
    singularityOnly: boolField({
      default: true,
      label: "Singularity sessions only",
      description:
        "When enabled, charts include only Claude sessions launched by Singularity (joined by claudeSessionId). When disabled, every Claude Code session on this machine is counted — including ad-hoc sessions outside Singularity.",
    }),
  },
});
