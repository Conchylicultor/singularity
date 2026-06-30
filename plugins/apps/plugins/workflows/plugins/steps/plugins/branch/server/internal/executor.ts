import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";
import { getByPath } from "@plugins/apps/plugins/workflows/plugins/steps/plugins/templating/core";

export const branchExecutor = defineStepExecutor({
  pluginId: "branch",
  async run({ step }) {
    const config = step.config as { field: string; defaultBranch?: string };
    const value = getByPath(step.input, config.field);
    const branchKey =
      value != null ? String(value) : (config.defaultBranch ?? undefined);
    return { branchKey };
  },
});
