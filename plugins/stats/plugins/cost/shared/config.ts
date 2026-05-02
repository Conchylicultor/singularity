import { defineConfig } from "@plugins/config/shared";

export const costConfig = defineConfig({
  singularityOnly: {
    default: true,
    description:
      "When enabled, charts include only Claude sessions launched by Singularity (joined by claudeSessionId). When disabled, every Claude Code session on this machine is counted — including ad-hoc sessions outside Singularity.",
    label: "Singularity sessions only",
  },
});
