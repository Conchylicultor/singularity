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
export {
  MissingImage,
  type MissingImageProps,
} from "./components/missing-image";
export {
  useImageLoad,
  type ImageFailure,
  type ImageLoad,
  type ImageLoadState,
} from "./internal/use-image-load";

export default {
  description:
    "One full-screen image viewer for every image in the app: ViewerThumbnail (the capped inline thumbnail that always shows the whole image, with a tiny-icon shape and a size badge) and useImageViewerTrigger (for callers that keep their own <img>) open it; an image that does not load shows MissingImage (its name, and whether the file is gone or only unreadable, with Retry) and leaves the gallery — useImageLoad gives a caller with its own <img> the same load state; ImageGallery makes every thumbnail inside one ← / → set in page order and renders the viewer inside its own React tree; ImageViewer is the controlled viewer itself — fit, click-to-close, wheel/pinch zoom, drag pan, minimap, copy/download/open, keyboard-isolated. A ViewerThumbnail outside any gallery is its own gallery of one; useImageViewerTrigger requires one.",
  contributions: [],
} satisfies PluginDefinition;
