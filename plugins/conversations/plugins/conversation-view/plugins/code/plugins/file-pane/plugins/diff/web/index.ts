import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import type { FileRendererTarget } from "../../../web/slots";
import { DiffView } from "./components/diff-view";
import { ImageDiffView } from "./components/image-diff-view";

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif",
]);

function isImagePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(base.slice(dot + 1));
}

function supportsFile(file: FileRendererTarget): "contextual" | false {
  if (
    file.status !== "modified" &&
    file.status !== "added" &&
    file.status !== "deleted" &&
    file.status !== "untracked"
  ) {
    return false;
  }
  return "contextual";
}

function DiffOrImageView(props: { conversationId: string; path: string }) {
  return isImagePath(props.path) ? ImageDiffView(props) : DiffView(props);
}

export default {
  id: "conversation-code-file-pane-diff",
  name: "Conversation: Code — Diff renderer",
  description:
    "Side-by-side diff of the file vs HEAD in the conversation's worktree.",
  contributions: [
    FilePane.Renderer({
      id: "diff",
      label: "Diff",
      supports: supportsFile,
      component: DiffOrImageView,
    }),
  ],
} satisfies PluginDefinition;
