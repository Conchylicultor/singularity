import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { RawView } from "./components/raw-view";

const rawPlugin: PluginDefinition = {
  id: "conversation-code-file-pane-raw",
  name: "Conversation: Code — Raw renderer",
  description:
    "Plain file renderer with syntax highlighting. Fallback tab for any text file.",
  contributions: [
    FilePane.Renderer({
      id: "raw",
      label: "Raw",
      supports: () => "fallback",
      component: RawView,
    }),
  ],
};

export default rawPlugin;
