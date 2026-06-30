import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";
import { interpolate } from "@plugins/apps/plugins/workflows/plugins/steps/plugins/templating/core";

export const templateExecutor = defineStepExecutor({
  pluginId: "template",
  async run({ step }) {
    const { template = "", json = false } = step.config as {
      template?: string;
      json?: boolean;
    };
    const rendered = interpolate(template, step.input);
    return { output: json ? JSON.parse(rendered) : rendered };
  },
});
