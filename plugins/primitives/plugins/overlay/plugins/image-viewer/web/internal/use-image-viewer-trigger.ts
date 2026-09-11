import {
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  type MouseEventHandler,
  type RefCallback,
} from "react";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import type { ScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import {
  GalleryContext,
  joinGallery,
  openInGallery,
  type GalleryState,
} from "./gallery-store";
import type { ViewerImage } from "./types";

/**
 * The enclosing gallery. There is no viewer without one: a hook cannot render,
 * and the viewer must render inside its opener's React tree — so a popover or
 * dialog around the opener sees the viewer's clicks and focus as its own
 * rather than as an outside press that dismisses it.
 */
function useGallery(): ScopedStore<GalleryState> {
  const gallery = useContext(GalleryContext);
  if (!gallery) {
    throw new Error(
      "useImageViewerTrigger must be rendered inside an <ImageGallery>; wrap the block, or use ViewerThumbnail (which is its own gallery of one)",
    );
  }
  return gallery;
}

/**
 * Make an element an image's place on the page: it joins the enclosing
 * gallery (in page order) while mounted, and `open()` shows its image in that
 * gallery's viewer. Throws outside any `<ImageGallery>`.
 *
 * `attach` is a stable callback ref for the element the image grows out of
 * and shrinks back into — the `<img>` itself, ideally. Focus returns to it (or
 * the nearest focusable element around it) on close. `open` is a stable
 * handler. Both are plain callbacks, not values read off a ref object, so a
 * caller can hand them straight to JSX.
 */
export function useViewerMember<T extends Element>(
  image: ViewerImage,
): { attach: RefCallback<T>; open: () => void } {
  const gallery = useGallery();
  const key = useId();
  const [element, setElement] = useState<T | null>(null);
  const attach = useCallback((el: T | null) => setElement(el), []);

  // Re-join on a real change of the image, field by field: callers pass a
  // fresh object literal every render, and re-joining would re-sort for
  // nothing.
  const { src, name, sourceLabel, alt, width, height } = image;
  useLayoutEffect(() => {
    if (!element) return;
    return joinGallery(gallery, key, {
      image: { src, name, sourceLabel, alt, width, height },
      element,
    });
  }, [gallery, element, key, src, name, sourceLabel, alt, width, height]);

  const open = useEventCallback(() => {
    if (element) openInGallery(gallery, key);
  });

  return { attach, open };
}

/** What {@link useImageViewerTrigger} returns: spread it onto the image
 *  element. */
export interface ImageViewerTrigger<T extends HTMLElement> {
  ref: RefCallback<T>;
  onClick: MouseEventHandler<T>;
  "aria-haspopup": "dialog";
}

/**
 * For a caller that keeps its own `<img>` (a resizable page image block):
 * spread the result onto it, and a click opens the viewer of the enclosing
 * `<ImageGallery>`. Throws outside one — the caller renders the gallery, since
 * a hook cannot render the viewer:
 *
 * ```tsx
 * // In a component rendered inside an <ImageGallery>:
 * const trigger = useImageViewerTrigger<HTMLImageElement>({ src, name });
 * return <img src={src} alt={name} {...trigger} />;
 * ```
 */
export function useImageViewerTrigger<T extends HTMLElement>(
  image: ViewerImage,
): ImageViewerTrigger<T> {
  const { attach, open } = useViewerMember<T>(image);
  const onClick = useCallback<MouseEventHandler<T>>(() => open(), [open]);
  return { ref: attach, onClick, "aria-haspopup": "dialog" };
}
