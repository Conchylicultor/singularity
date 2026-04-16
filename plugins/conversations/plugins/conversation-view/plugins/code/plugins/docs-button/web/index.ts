import type { PluginDefinition } from "@core";
import { Code } from "../../../web/slots";
import { DocsButton } from "./components/docs-button";

const docsButtonPlugin: PluginDefinition = {
  id: "conversation-code-docs-button",
  name: "Conversation: Code — Docs button",
  description:
    "Toolbar button that opens a sidebar listing edited markdown design docs in the conversation worktree.",
  contributions: [
    Code.ToolbarButton({
      component: DocsButton,
    }),
  ],
};

export default docsButtonPlugin;
