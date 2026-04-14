import type { PluginDefinition } from "@core";
import { Code } from "../../../web/slots";
import { EditedFilesButton } from "./components/edited-files-button";

const editedFilesButtonPlugin: PluginDefinition = {
  id: "conversation-code-edited-files-button",
  name: "Conversation: Code — Edited files button",
  description:
    "Toolbar button showing the number of files edited in the conversation's worktree.",
  contributions: [
    Code.ToolbarButton({
      component: EditedFilesButton,
    }),
  ],
};

export default editedFilesButtonPlugin;
