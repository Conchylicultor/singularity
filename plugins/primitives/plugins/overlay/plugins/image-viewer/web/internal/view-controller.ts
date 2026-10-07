import type { ScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import {
  areaCenter,
  centerOn,
  clampTile,
  stepTile,
  clampView,
  fitScale,
  fitView,
  isZoomed,
  panView,
  stepScale,
  viewOverRect,
  viewerArea,
  zoomAt,
  type Area,
  type Rect,
  type Size,
  type View,
  type ViewerChrome,
} from "../../core";
import type { ViewMeta, ViewState } from "./view-store";

/** What the controller needs from the component around it, read at call time. */
export interface ViewerEnv {
  /** The shown image's thumbnail, in stage coordinates, when it is on screen. */
  originRect(): Rect | null;
  /** `prefers-reduced-motion: reduce` — no growing or shrinking, fade only. */
  reducedMotion(): boolean;
  /** Run `fn` once the current frame has painted, so a just-written start
   *  state is on screen before the transition to the end state begins. */
  afterPaint(fn: () => void): void;
}

export type ViewController = ReturnType<typeof createViewController>;

/**
 * The viewer's behaviour over its store. Every zoom, pan, fit and phase change
 * is one function here, composed from the pure `core/` geometry. Created once
 * per open viewer. Nothing here touches the DOM: the element writer subscribes
 * to the store for that.
 */
export function createViewController(
  store: ScopedStore<ViewState>,
  env: ViewerEnv,
) {
  const get = () => store.getState();
  const patch = (p: Partial<ViewState>, meta: ViewMeta = { animate: false }) =>
    store.setState((s) => ({ ...s, ...p }), { meta });

  /** Natural size and area, once both are known. */
  function geometry(): { image: Size; area: Area } | null {
    const { natural, area } = get();
    return natural && area ? { image: natural, area } : null;
  }

  /** The last measured stage, kept so a layout change (the strip docking, the
   *  slideshow starting) can recompute the area without a resize. */
  let stage: { size: Size; navigable: boolean } | null = null;

  /** What covers the stage's edges in the current state. */
  function chrome(s: ViewState, navigable: boolean): ViewerChrome {
    if (s.slideshow) return "none";
    return s.strip && navigable && s.layout === "single"
      ? "bars-and-strip"
      : "bars";
  }

  function setView(view: View, atFit: boolean, animate: boolean) {
    patch({ view, atFit }, { animate: animate && !env.reducedMotion() });
  }

  /** Re-fit a fitted image; re-clamp a zoomed one. For when the image or the
   *  stage changed size under the current view. */
  function settle(animate = false) {
    const g = geometry();
    if (!g || get().phase === "opening") return;
    const { view, atFit } = get();
    setView(
      atFit ? fitView(g.image, g.area) : clampView(view, g.image, g.area),
      atFit,
      animate,
    );
  }

  /** Recompute the area from the last stage and the current state, then
   *  settle the image into it. */
  function relayout(animate: boolean) {
    if (!stage) return;
    patch({
      area: viewerArea(stage.size, {
        navigable: stage.navigable,
        chrome: chrome(get(), stage.navigable),
      }),
    });
    settle(animate);
  }

  /** Bumped by every {@link tryOpen}, so a later attempt cancels the frame
   *  step an earlier one scheduled. */
  let openAttempt = 0;

  /**
   * Run the open once the stage is measured. With the image's size known, grow
   * it out of the thumbnail when that is on screen, or fade it in. With the
   * size unknown (its thumbnail had not loaded either), open straight to the
   * loading state; the image then fades in when it arrives — and if it
   * arrives before that frame, this runs again and grows it after all.
   */
  function tryOpen() {
    const { phase, area, natural } = get();
    if (phase !== "opening" || !area) return;
    const attempt = ++openAttempt;
    const step = (fn: () => void) =>
      env.afterPaint(() => {
        if (attempt === openAttempt && get().phase === "opening") fn();
      });
    if (!natural) {
      step(() => patch({ phase: "open" }));
      return;
    }
    const from = env.reducedMotion() ? null : env.originRect();
    if (from) {
      setView(viewOverRect(from, natural), true, false);
      patch({ imageVisible: true });
      step(() => {
        patch({ phase: "open" });
        setView(fitView(natural, area), true, true);
      });
    } else {
      setView(fitView(natural, area), true, false);
      step(() => patch({ phase: "open", imageVisible: true }));
    }
  }

  function zoomTo(scale: number, px: number, py: number, animate: boolean) {
    const g = geometry();
    if (!g) return;
    const view = zoomAt(get().view, scale, px, py, g.image, g.area);
    setView(view, !isZoomed(view, g.image, g.area), animate);
  }

  function toFit(animate: boolean) {
    const g = geometry();
    if (!g) return;
    setView(fitView(g.image, g.area), true, animate);
  }

  return {
    /** The stage was measured or resized. `navigable` = the side arrows show. */
    measure(size: Size, navigable: boolean) {
      stage = { size, navigable };
      relayout(false);
      tryOpen();
    },

    /** A new image is about to show. `seed` is its natural size when already
     *  known (the caller said so, or its thumbnail has loaded). */
    showImage(seed: Size | null) {
      patch({ natural: seed, failed: false, atFit: true, imageVisible: false });
      settle();
      tryOpen();
    },

    /**
     * Another image, already decoded, replaces the one on screen in the same
     * frame: fitted at `natural`, and painted at once — the old one stays up
     * until this moment, so nothing in between is ever blank.
     */
    swapTo(natural: Size) {
      patch({
        natural,
        failed: false,
        atFit: true,
        ...(get().phase === "open" ? { imageVisible: true } : {}),
      });
      settle();
      tryOpen();
    },

    /** The image element finished loading at `natural`. */
    loaded(natural: Size) {
      const had = get().natural;
      if (
        !had ||
        had.width !== natural.width ||
        had.height !== natural.height
      ) {
        patch({ natural });
        settle();
      }
      if (get().phase === "opening") tryOpen();
      else if (get().phase === "open") patch({ imageVisible: true });
    },

    /** The image element failed to load. */
    failedToLoad() {
      patch({
        failed: true,
        imageVisible: false,
        ...(get().phase === "opening" ? { phase: "open" as const } : {}),
      });
    },

    /** Start the close: shrink back into the thumbnail when it is on screen,
     *  fade out otherwise. The caller unmounts once the transition is over. */
    beginClose() {
      if (get().phase === "closing") return;
      const natural = get().natural;
      // From the grid there is no image on the stage to shrink back: fade.
      const to =
        natural && !env.reducedMotion() && get().layout === "single"
          ? env.originRect()
          : null;
      patch({ phase: "closing", sheet: false, idle: false, dragging: false });
      if (to && natural) setView(viewOverRect(to, natural), false, true);
      else patch({ imageVisible: false });
    },

    zoomTo,
    toFit,

    /** Multiply the zoom around a point (a wheel notch, a pinch step). */
    zoomBy(factor: number, px: number, py: number) {
      zoomTo(get().view.scale * factor, px, py, false);
    },

    /** `+` / `−`: the next ladder rung, around the room's centre. */
    step(dir: 1 | -1) {
      const g = geometry();
      if (!g) return;
      const c = areaCenter(g.area);
      zoomTo(
        stepScale(get().view.scale, dir, fitScale(g.image, g.area)),
        c.x,
        c.y,
        true,
      );
    },

    actualSize() {
      const g = geometry();
      if (!g) return;
      const c = areaCenter(g.area);
      zoomTo(1, c.x, c.y, true);
    },

    /** A drag has moved `(dx, dy)` since it started at `from`. */
    pan(from: View, dx: number, dy: number) {
      const g = geometry();
      if (!g) return;
      setView(panView(from, dx, dy, g.image, g.area), false, false);
    },

    /** The minimap was pressed on image pixel `(ix, iy)`. */
    centerOn(ix: number, iy: number) {
      const g = geometry();
      if (!g) return;
      setView(centerOn(get().view, ix, iy, g.image, g.area), false, false);
    },

    isZoomed(): boolean {
      const g = geometry();
      return g ? isZoomed(get().view, g.image, g.area) : false;
    },

    setDragging(dragging: boolean) {
      if (get().dragging !== dragging) patch({ dragging });
    },
    setIdle(idle: boolean) {
      if (get().idle !== idle) patch({ idle });
    },
    setSheet(sheet: boolean) {
      if (get().sheet !== sheet) patch({ sheet });
    },
    setStatus(status: string | null) {
      if (get().status !== status) patch({ status });
    },
    setHint(hint: boolean) {
      if (get().hint !== hint) patch({ hint });
    },

    /** Dock or undock the thumbnail strip; the image refits into the room left. */
    setStrip(strip: boolean) {
      if (get().strip === strip) return;
      patch({ strip });
      relayout(true);
    },
    /** Switch between the one image and the grid of every image. Back in the
     *  single layout the image opens fitted. */
    setLayout(layout: "single" | "grid") {
      if (get().layout === layout) return;
      patch({
        layout,
        sheet: false,
        idle: false,
        dragging: false,
        atFit: true,
      });
      relayout(false);
    },
    /** The browser entered or left full screen on the viewer. The slideshow
     *  is always the single image, fitted to the whole screen. */
    setSlideshow(slideshow: boolean) {
      if (get().slideshow === slideshow) return;
      patch({ slideshow, sheet: false, atFit: true });
      if (slideshow && get().layout === "grid") patch({ layout: "single" });
      relayout(false);
    },
    setTile(tile: number) {
      const t = clampTile(tile);
      if (get().tile !== t) patch({ tile: t });
    },
    /** `+` / `−` over the grid: one tile-size step. */
    stepTile(dir: 1 | -1) {
      const t = stepTile(get().tile, dir);
      if (get().tile !== t) patch({ tile: t });
    },
  };
}
