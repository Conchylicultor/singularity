import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import type { Area, Size, View } from "../../core";

/**
 * - `opening` — mounted; growing out of the thumbnail (or fading in).
 * - `open` — settled; controls showing.
 * - `closing` — shrinking back into the thumbnail (or fading out); the viewer
 *   unmounts when it ends.
 */
export type Phase = "opening" | "open" | "closing";

/** Everything one open viewer knows. Kept in a scoped store, not React state:
 *  a drag or a wheel zoom rewrites `view` every frame, and those writes must go
 *  straight to the image element without rendering anything. Components read
 *  the few slices they display through `useSelector`, so they re-render only
 *  when their slice changes (the zoom readout: when the rounded percent does). */
export interface ViewState {
  /** The shown image's natural size. `null` until known — the stage shows
   *  `Loading` meanwhile, never a guessed fit. */
  readonly natural: Size | null;
  /** The image failed to load. */
  readonly failed: boolean;
  /** The stage and its control insets. `null` until the stage is measured. */
  readonly area: Area | null;
  /** The transform on the image element. */
  readonly view: View;
  /** Whether a resize re-fits (true until the user zooms or pans away). */
  readonly atFit: boolean;
  readonly phase: Phase;
  /** Whether the image is painted (opacity). Off while loading, while fading
   *  between gallery images, and for a close with nowhere to shrink back to. */
  readonly imageVisible: boolean;
  /** A pan drag is in progress (grabbing cursor). */
  readonly dragging: boolean;
  /** The controls have faded after a quiet spell while zoomed. */
  readonly idle: boolean;
  /** The `?` shortcut sheet is open. */
  readonly sheet: boolean;
  /** The feedback pill's text ("Image copied"), or `null` when hidden. */
  readonly status: string | null;
  /** The first-open hint ("Click to see it at 100% · …") is showing. */
  readonly hint: boolean;
}

/** Rides on `setState(…, { meta })` so the element writer knows whether this
 *  change animates (a click zoom) or follows the pointer (a drag). */
export interface ViewMeta {
  readonly animate: boolean;
}

export const ViewStore = defineScopedStore<ViewState>({
  natural: null,
  failed: false,
  area: null,
  view: { scale: 1, x: 0, y: 0 },
  atFit: true,
  phase: "opening",
  imageVisible: false,
  dragging: false,
  idle: false,
  sheet: false,
  status: null,
  hint: false,
});

/** Read a store notification's meta back. */
export function readMeta(meta: unknown): ViewMeta {
  return meta !== null && typeof meta === "object" && "animate" in meta
    ? (meta as ViewMeta)
    : { animate: false };
}
