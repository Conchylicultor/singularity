import { fileExtension } from "@plugins/primitives/plugins/file-viewer/core";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "avif",
]);

export function supportsImage(path: string): "native" | false {
  return IMAGE_EXTS.has(fileExtension(path)) ? "native" : false;
}
