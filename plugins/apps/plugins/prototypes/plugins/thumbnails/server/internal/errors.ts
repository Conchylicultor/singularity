import type { ThumbnailFailureKind } from "../../core";

/**
 * A render that produced no trustworthy picture — thrown, never returned as an
 * empty value a caller could cache.
 *
 * Its own module so the classifier and the job can name it without pulling in
 * the browser-launching half of this plugin.
 */
export class ThumbnailRenderError extends Error {
  constructor(
    readonly kind: ThumbnailFailureKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ThumbnailRenderError";
  }
}
