import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export type { ViewerImage } from "./internal/types";
export { ImageGallery } from "./components/image-gallery";
export {
  ViewerThumbnail,
  type ViewerThumbnailProps,
} from "./components/viewer-thumbnail";
export {
  useImageViewerTrigger,
  type ImageViewerTrigger,
} from "./internal/use-image-viewer-trigger";
export { ImageViewer, type ImageViewerProps } from "./components/image-viewer";

export default {
  description:
    "One full-screen image viewer for every image in the app: ViewerThumbnail (the capped inline thumbnail, with tall/tiny shapes and a size badge) and useImageViewerTrigger (for callers that keep their own <img>) open it; ImageGallery makes every thumbnail inside one ← / → set in page order and renders the viewer inside its own React tree; ImageViewer is the controlled viewer itself — fit, click-to-100%, wheel/pinch zoom, drag pan, minimap, copy/download/open, keyboard-isolated. A ViewerThumbnail outside any gallery is its own gallery of one; useImageViewerTrigger requires one.",
  contributions: [],
} satisfies PluginDefinition;
