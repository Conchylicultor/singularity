import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdAutoAwesome } from "react-icons/md";
import { LlmPromptConfig } from "./components/llm-prompt-config";
import { LlmPromptExecution } from "./components/llm-prompt-execution";

export default {
  description:
    "LLM-prompt step type for workflows. Runs a one-shot Claude generation on an interpolated prompt and emits the generated text.",
  contributions: [
    Workflows.StepType({
      pluginId: "llm-prompt",
      label: "LLM Prompt",
      icon: MdAutoAwesome,
      configComponent: LlmPromptConfig,
      executionComponent: LlmPromptExecution,
    }),
  ],
} satisfies PluginDefinition;
