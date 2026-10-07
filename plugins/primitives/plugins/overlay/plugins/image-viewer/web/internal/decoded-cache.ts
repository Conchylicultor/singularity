import type { Size } from "../../core";

/**
 * A few images loaded AND decoded ahead of being shown, so swapping the stage
 * to one paints in the same frame — no blank, no fade. Each entry keeps its
 * element referenced, which keeps the browser's decoded bitmap warm; the
 * oldest is dropped past `max`, so a viewer holds a bounded number of
 * full-screen bitmaps. One per open viewer: closing it releases them all.
 */
export interface DecodedCache {
  /** Load and decode `url`; resolves with its pixel size. A failed load
   *  rejects (the browser's `EncodingError`) and is not kept. */
  load(url: string): Promise<Size>;
}

export function createDecodedCache(max: number): DecodedCache {
  // The element is held, not only the promise: once settled, the promise no
  // longer references it, and a collected element lets its bitmap go.
  const entries = new Map<
    string,
    { img: HTMLImageElement; ready: Promise<Size> }
  >();
  return {
    load(url) {
      const hit = entries.get(url);
      if (hit) {
        // Most recently used last.
        entries.delete(url);
        entries.set(url, hit);
        return hit.ready;
      }
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      const ready = img.decode().then(
        (): Size => ({ width: img.naturalWidth, height: img.naturalHeight }),
        (err: unknown) => {
          entries.delete(url);
          throw err;
        },
      );
      entries.set(url, { img, ready });
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
      return ready;
    },
  };
}

/** The one failure a load is expected to have: the bytes did not come or do
 *  not decode (a missing file, a copy the server could not make). */
export function isLoadFailure(err: unknown): boolean {
  return err instanceof DOMException && err.name === "EncodingError";
}
