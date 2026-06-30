import { defineStepExecutor } from "@plugins/apps/plugins/workflows/plugins/engine/server";
import { interpolate } from "@plugins/apps/plugins/workflows/plugins/steps/plugins/templating/core";
import { runClaudePrint } from "@plugins/infra/plugins/claude-cli/server";
import {
  MODEL_TIERS,
  type ModelTier,
} from "@plugins/conversations/plugins/model-provider/core";

const DEFAULT_TIER: ModelTier = "haiku";

function resolveTier(raw: unknown): ModelTier {
  return MODEL_TIERS.includes(raw as ModelTier)
    ? (raw as ModelTier)
    : DEFAULT_TIER;
}

export const llmPromptExecutor = defineStepExecutor({
  pluginId: "llm-prompt",
  async run({ execution, step }) {
    const config = (step.config ?? {}) as {
      tier?: string;
      system?: string;
      prompt?: string;
    };

    const prompt = interpolate(config.prompt ?? "", step.input);
    if (!prompt.trim()) {
      throw new Error("llm-prompt step has an empty prompt after interpolation");
    }

    const text = await runClaudePrint({
      tier: resolveTier(config.tier),
      prompt,
      system: config.system || undefined,
      timeoutMs: 60_000,
      source: {
        name: "workflows:llm-prompt",
        context: { executionId: execution.id, stepId: step.id },
      },
    });

    return { output: { text: text.trim() } };
  },
});
