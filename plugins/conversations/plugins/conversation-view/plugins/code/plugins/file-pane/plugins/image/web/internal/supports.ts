const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif",
]);

export function supportsImage(file: { path: string }): "native" | false {
  const base = file.path.slice(file.path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(base.slice(dot + 1)) ? "native" : false;
}
