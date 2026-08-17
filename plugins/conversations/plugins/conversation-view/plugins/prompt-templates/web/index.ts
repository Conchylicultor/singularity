import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PromptEditorSlots } from "@plugins/primitives/plugins/prompt-editor/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { FloatingTemplateChips } from "./components/prompt-template-chips";
import { promptTemplatesConfig } from "../shared/config";

export default {
  description:
    "Template chips inside the prompt editor that prepend text to the draft. A floating icon expands on hover to reveal available templates.",
  contributions: [
    PromptEditorSlots.FloatingAction({
      id: "prompt-templates",
      component: FloatingTemplateChips,
      // The chip strip is the prompt row's expanding cell: it renders as many
      // chips as the row can spare room for, so it needs room that is GIVEN to
      // it rather than derived from the chips it decided to render. Every other
      // action in this row is a rigid button.
      fill: true,
    }),
    ConfigV2.WebRegister({ descriptor: promptTemplatesConfig }),
  ],
} satisfies PluginDefinition;
