import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FilePane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { ImageView } from "./components/image-view";
import { supportsImage } from "./internal/supports";

export default {
  id: "conversation-code-file-pane-image",
  name: "Conversation: Code — Image renderer",
  description: "Image preview for .png, .jpg, .gif, .webp, .svg, and similar files.",
  contributions: [
    FilePane.Renderer({
      id: "image",
      label: "Image",
      supports: supportsImage,
      component: ImageView,
    }),
  ],
} satisfies PluginDefinition;
