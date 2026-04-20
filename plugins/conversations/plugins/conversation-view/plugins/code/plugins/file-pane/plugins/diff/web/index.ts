import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { DiffView } from "./components/diff-view";

export default {
  id: "conversation-code-file-pane-diff",
  name: "Conversation: Code — Diff renderer",
  description:
    "Side-by-side diff of the file vs HEAD in the conversation's worktree.",
  contributions: [
    FilePane.Renderer({
      id: "diff",
      label: "Diff",
      supports: (file) =>
        file.status === "modified" ||
        file.status === "added" ||
        file.status === "deleted" ||
        file.status === "untracked"
          ? "contextual"
          : false,
      component: DiffView,
    }),
  ],
} satisfies PluginDefinition;
