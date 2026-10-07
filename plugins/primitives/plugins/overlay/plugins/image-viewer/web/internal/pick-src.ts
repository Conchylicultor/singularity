import type { Size } from "../../core";
import type { ViewerImage } from "./types";

/** The device's pixels per CSS pixel. */
export function pixelRatio(): number {
  return window.devicePixelRatio || 1;
}

/** The size the caller told us, when it did. */
export function knownSize(image: ViewerImage): Size | null {
  return image.width && image.height
    ? { width: image.width, height: image.height }
    : null;
}

/**
 * The URL to draw `image` with when its long edge covers `edge` device pixels:
 * a resized copy when the caller offers one and the original is larger, the
 * original otherwise. `size` is the original's — without it a copy is used
 * only where its size does not matter (`sizeMatters: false`: a thumbnail
 * drawn with `object-fit`).
 */
export function pickSrc(
  image: ViewerImage,
  edge: number,
  sizeMatters: boolean,
): string {
  if (!image.resized) return image.src;
  const size = knownSize(image);
  if (!size) return sizeMatters ? image.src : image.resized(edge);
  return Math.max(size.width, size.height) > edge
    ? image.resized(edge)
    : image.src;
}

/**
 * The long edge, in device pixels, `natural` covers when fitted into a box of
 * `box` CSS pixels (never enlarged), times `scale` — what the stage needs a
 * copy at least this large for.
 */
export function shownEdge(natural: Size, box: Size, scale = 1): number {
  const fit = Math.min(
    1,
    box.width / natural.width,
    box.height / natural.height,
  );
  return (
    Math.ceil(Math.max(natural.width, natural.height) * fit * scale) *
    pixelRatio()
  );
}
