import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { SelectionToolbar } from "./components/selection-toolbar";
import { selectionAnswersConfig } from "../shared/config";

export default {
  description:
    "Selecting text in an agent's reply pops a toolbar above it: Quote puts the selection in the prompt as a quote, and the quick answers (Go, Explain — a setting of its own) are the prompt templates' chip bar — the most-used pinned, every one in the panel that opens from ✎: a chip's name quotes the selection and puts the answer in the prompt to edit, ➤ sends both right away.",
  contributions: [
    JsonlViewer.Overlay({
      id: "selection-actions",
      component: SelectionToolbar,
    }),
    ConfigV2.WebRegister({ descriptor: selectionAnswersConfig }),
  ],
} satisfies PluginDefinition;
