import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { llmPromptExecutor } from "./internal/executor";

export default {
  description:
    "LLM-prompt step type for workflows. Runs a one-shot Claude generation on an interpolated prompt and emits the generated text.",
  register: [llmPromptExecutor],
} satisfies ServerPluginDefinition;
