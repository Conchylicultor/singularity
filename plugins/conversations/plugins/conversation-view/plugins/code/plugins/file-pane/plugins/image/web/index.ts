import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { ImageView } from "./components/image-view";

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif",
]);

function isImagePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(base.slice(dot + 1));
}

export default {
  id: "conversation-code-file-pane-image",
  name: "Conversation: Code — Image renderer",
  description: "Image preview for .png, .jpg, .gif, .webp, .svg, and similar files.",
  contributions: [
    FilePane.Renderer({
      id: "image",
      label: "Image",
      supports: (file) => (isImagePath(file.path) ? "native" : false),
      component: ImageView,
    }),
  ],
} satisfies PluginDefinition;
