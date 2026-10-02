import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { ImageView } from "./components/image-view";
import { supportsImage } from "./internal/supports";

export default {
  description:
    "Image preview for .png, .jpg, .gif, .webp, .svg, and similar files.",
  contributions: [
    FileViewer.Renderer({
      id: "image",
      label: "Image",
      supports: ({ file }) => supportsImage(file.path),
      component: ImageView,
    }),
  ],
} satisfies PluginDefinition;
