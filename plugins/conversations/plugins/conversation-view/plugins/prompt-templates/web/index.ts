import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PromptEditorSlots } from "@plugins/primitives/plugins/prompt-editor/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { FloatingTemplateChips } from "./components/prompt-template-chips";
import { promptTemplatesConfig } from "../shared/config";

export default {
  name: "Conversation: Prompt Templates",
  description:
    "Template chips inside the prompt editor that prepend text to the draft. A floating icon expands on hover to reveal available templates.",
  contributions: [
    PromptEditorSlots.FloatingAction({
      id: "prompt-templates",
      component: FloatingTemplateChips,
    }),
    ConfigV2.WebRegister({ descriptor: promptTemplatesConfig }),
  ],
} satisfies PluginDefinition;
