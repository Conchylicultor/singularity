import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";

export const setValueExecutor = defineStepExecutor({
  pluginId: "set-value",
  async run({ step }) {
    const { value = "", json = false } = step.config as {
      value?: string;
      json?: boolean;
    };
    if (json) {
      return { output: JSON.parse(value) };
    }
    return { output: value };
  },
});
