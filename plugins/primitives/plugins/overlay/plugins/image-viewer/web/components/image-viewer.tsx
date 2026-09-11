import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { announce } from "@plugins/primitives/plugins/announce/web";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import {
  COMPACT_BELOW,
  imageCapabilities,
  isZoomed,
  matchViewerKey,
  type Rect,
  type Size,
  type ViewerAction,
} from "../../core";
import {
  copyImage,
  downloadImage,
  openOriginal,
} from "../internal/file-actions";
import { createStageGestures } from "../internal/stage-gestures";
import { sameImage, type ViewerImage } from "../internal/types";
import { createViewController } from "../internal/view-controller";
import { ViewStore, readMeta, type ViewState } from "../internal/view-store";
import {
  BottomBar,
  HOVERED_CHROME,
  Minimap,
  NavArrows,
  TopBar,
} from "./viewer-chrome";

export interface ImageViewerProps {
  /** Every image the viewer can step through, in order. */
  images: readonly ViewerImage[];
  /** The one on screen. Must index into `images`. */
  index: number;
  /** ← / → or an arrow button asked for another image. */
  onIndexChange(index: number): void;
  /** The close animation has finished; unmount the viewer now. */
  onClose(): void;
  /**
   * The on-page element each image was opened from (its thumbnail). The viewer
   * grows the image out of it on open and shrinks it back into it on close,
   * hides it while its image is on screen (so the image looks lifted out of
   * the page, not copied), and returns focus to it — or to the nearest
   * focusable element around it — on close. `null`, or omitted: fade instead.
   */
  originOf?: (index: number) => Element | null;
}

/** How long the shrink-back takes; the viewer unmounts after it. */
const CLOSE_MS = 280;
/** How long a fade takes (reduced motion, or nowhere to shrink back to). */
const FADE_MS = 200;
/** The fade-out before the next gallery image is swapped in. */
const SWAP_MS = 90;
/** Quiet time before the controls fade while zoomed. */
const IDLE_MS = 2200;
/** How long the "Image copied" pill stays up. */
const STATUS_MS = 1600;
/** How long the first-open hint stays up. */
const HINT_MS = 3200;

/** Motion for a click, key or button zoom; a drag or wheel zoom writes with
 *  no transform transition, so the image follows the pointer exactly. */
const TRANSITION_ZOOM =
  "transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms";
const TRANSITION_FADE = "opacity 200ms";

// The first-open hint shows once per page load, not on every open. A page-wide
// fact on purpose (not per viewer): it is about whether this user has been told.
let hintShown = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** `el`'s box in stage coordinates, when any of it is on screen. */
function rectOnStage(el: Element, stage: Element): Rect | null {
  const r = el.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const onScreen =
    r.width > 0 &&
    r.bottom > s.top &&
    r.top < s.bottom &&
    r.right > s.left &&
    r.left < s.right;
  return onScreen
    ? {
        left: r.left - s.left,
        top: r.top - s.top,
        width: r.width,
        height: r.height,
      }
    : null;
}

/** An already-loaded `<img>` thumbnail knows the natural size before the
 *  viewer's own copy has loaded. */
function loadedSize(el: Element | null): Size | null {
  return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0
    ? { width: el.naturalWidth, height: el.naturalHeight }
    : null;
}

/** Write the store's view onto the image element: the per-frame path that
 *  never goes through React. */
function writeImage(img: HTMLImageElement, s: ViewState, animate: boolean) {
  const { scale, x, y } = s.view;
  img.style.transition = animate ? TRANSITION_ZOOM : TRANSITION_FADE;
  img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  // Past 100% the pixels are the content — show them square, not smeared.
  img.style.imageRendering = scale > 1.001 ? "pixelated" : "";
  img.style.opacity = s.imageVisible ? "1" : "0";
}

/** Tab and Shift+Tab cycle through the viewer's own buttons only. */
function cycleFocus(e: ReactKeyboardEvent, root: HTMLElement) {
  e.preventDefault();
  const items = [
    ...root.querySelectorAll<HTMLElement>("button:not(:disabled)"),
  ];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    at < 0
      ? e.shiftKey
        ? items.length - 1
        : 0
      : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
  items[next]?.focus();
}

/** Where focus goes on close: the thumbnail's own control, else whatever had
 *  focus before the viewer opened. */
function restoreFocus(origin: Element | null, previous: Element | null) {
  const target =
    origin?.closest<HTMLElement>("button, a[href], [tabindex]") ??
    (previous instanceof HTMLElement ? previous : null);
  target?.focus({ preventScroll: true });
}

/** `images[index]`, or a loud failure: an index outside the list is a caller bug. */
function imageAt(images: readonly ViewerImage[], index: number): ViewerImage {
  const image = images[index];
  if (!image) {
    throw new Error(
      `ImageViewer: index ${index} is outside the ${images.length} image(s) it was given`,
    );
  }
  return image;
}

/**
 * The full-window image viewer, controlled: the caller owns which image is on
 * screen and when the viewer is mounted. Most callers never render this —
 * `ViewerThumbnail` / `useImageViewerTrigger` open it through a gallery. It is
 * for sites that have images but no thumbnails of their own (mail HTML).
 */
export function ImageViewer(props: ImageViewerProps) {
  return (
    <ViewStore.Provider>
      <ViewerFrame {...props} />
    </ViewStore.Provider>
  );
}

function ViewerFrame({
  images,
  index,
  onIndexChange,
  onClose,
  originOf,
}: ImageViewerProps) {
  const current = imageAt(images, index);
  const store = ViewStore.useStoreApi();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previousFocus = useRef<Element | null>(null);
  const timers = useRef(new Set<number>());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const cancel = useCallback((id: number | null) => {
    if (id === null) return;
    window.clearTimeout(id);
    timers.current.delete(id);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  const originRect = useEventCallback((): Rect | null => {
    const el = originOf?.(index) ?? null;
    const stage = stageRef.current;
    return el && stage ? rectOnStage(el, stage) : null;
  });
  const [ctl] = useState(() =>
    createViewController(store, {
      originRect,
      reducedMotion: prefersReducedMotion,
      afterPaint: (fn) =>
        requestAnimationFrame(() => requestAnimationFrame(fn)),
    }),
  );

  // --- closing -------------------------------------------------------------
  const requestClose = useEventCallback(() => {
    if (store.getState().phase === "closing") return;
    ctl.beginClose();
    const shrinks = store.getState().imageVisible && !prefersReducedMotion();
    later(
      () => {
        restoreFocus(originOf?.(index) ?? null, previousFocus.current);
        onClose();
      },
      shrinks ? CLOSE_MS : FADE_MS,
    );
  });
  const [gestures] = useState(() =>
    createStageGestures(ctl, store, requestClose),
  );

  // --- the image on screen -------------------------------------------------
  // `shown` trails `current` by a short fade, so ← / → reads as a swap, not a
  // jump. Rapid presses keep moving `index` (the counter follows at once); the
  // swap then lands on whichever image is current when the fade ends.
  const [shown, setShown] = useState({ image: current, generation: 0 });
  const swapping = !sameImage(current, shown.image);
  const currentRef = useEventCallback(() => current);
  useEffect(() => {
    if (!swapping) return;
    store.setState((s) => ({ ...s, imageVisible: false }));
    const id = later(() => {
      const image = currentRef();
      setShown((prev) => ({ image, generation: prev.generation + 1 }));
    }, SWAP_MS);
    return () => cancel(id);
  }, [swapping, store, later, cancel, currentRef]);

  const seedFor = useEventCallback((image: ViewerImage): Size | null =>
    image.width && image.height
      ? { width: image.width, height: image.height }
      : loadedSize(originOf?.(index) ?? null),
  );
  useLayoutEffect(() => {
    ctl.showImage(seedFor(shown.image));
  }, [ctl, seedFor, shown]);

  // The element writer: every store change that moves or shows the image is
  // written straight onto the <img>, animated only when the change asked to be.
  useLayoutEffect(() => {
    let last = store.getState();
    return store.subscribe((meta) => {
      const s = store.getState();
      const img = imgRef.current;
      const moved = s.view !== last.view;
      if (img && (moved || s.imageVisible !== last.imageVisible)) {
        writeImage(img, s, moved && readMeta(meta).animate);
      }
      last = s;
    });
  }, [store]);
  const setImg = useCallback(
    (el: HTMLImageElement | null) => {
      imgRef.current = el;
      if (el) writeImage(el, store.getState(), false);
    },
    [store],
  );

  // --- the thumbnail the image was lifted out of ---------------------------
  useLayoutEffect(() => {
    const el = originOf?.(index);
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return;
    const before = el.style.visibility;
    el.style.visibility = "hidden";
    return () => {
      el.style.visibility = before;
    };
  }, [originOf, index]);

  // --- stage size ----------------------------------------------------------
  const navigable = images.length > 1;
  useResizeObserver(
    stageRef,
    () => {
      const stage = stageRef.current;
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      ctl.measure({ width: r.width, height: r.height }, navigable);
    },
    { deps: [navigable] },
  );
  const compact = ViewStore.useSelector(
    (s) => s.area !== null && s.area.width < COMPACT_BELOW,
    [],
  );

  // --- focus ---------------------------------------------------------------
  useLayoutEffect(() => {
    const root = rootRef.current;
    // Guarded so a re-run (StrictMode) does not record the viewer itself.
    if (!root?.contains(document.activeElement))
      previousFocus.current = document.activeElement;
    root?.focus({ preventScroll: true });
  }, []);

  // --- the controls' idle fade ---------------------------------------------
  const idleTimer = useRef<number | null>(null);
  const wake = useEventCallback(() => {
    cancel(idleTimer.current);
    idleTimer.current = null;
    ctl.setIdle(false);
    if (!ctl.isZoomed()) return;
    idleTimer.current = later(() => {
      idleTimer.current = null;
      if (
        store.getState().sheet ||
        rootRef.current?.querySelector(HOVERED_CHROME)
      )
        return;
      ctl.setIdle(true);
    }, IDLE_MS);
  });

  // --- first-open hint -----------------------------------------------------
  // Decided once per mount (read, never written, in render), so a StrictMode
  // effect re-run shows the hint again instead of finding the flag spent.
  const [firstOpen] = useState(() => !hintShown);
  useEffect(() => {
    if (!firstOpen) return;
    hintShown = true;
    ctl.setHint(true);
    const id = later(() => ctl.setHint(false), HINT_MS);
    return () => {
      cancel(id);
      ctl.setHint(false);
    };
  }, [firstOpen, ctl, later, cancel]);

  // --- wheel (non-passive, so it can keep the page from scrolling) ---------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      gestures.wheel(e, stage);
      wake();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [gestures, wake]);

  // --- actions -------------------------------------------------------------
  const capabilities = imageCapabilities(
    shown.image.src,
    window.location.origin,
  );
  const statusTimer = useRef<number | null>(null);
  const feedback = useEventCallback((message: string) => {
    cancel(statusTimer.current);
    ctl.setStatus(message);
    announce(message);
    statusTimer.current = later(() => ctl.setStatus(null), STATUS_MS);
  });

  const copy = useEventCallback(async (): Promise<void> => {
    const img = imgRef.current;
    if (!img || !capabilities.copy || store.getState().natural === null) return;
    try {
      await copyImage(img, shown.image.src);
    } catch (err) {
      // The one refusal a user can cause: the browser denies clipboard access
      // (permission, or the page lost focus mid-copy). Anything else is a bug.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        feedback("The browser didn't allow copying the image");
        return;
      }
      throw err;
    }
    feedback("Image copied");
  });
  const download = useEventCallback(() => {
    downloadImage(shown.image.src, shown.image.name);
    feedback(`Downloading ${shown.image.name}`);
  });
  const open = useEventCallback(() => {
    if (capabilities.open !== "none")
      openOriginal(shown.image.src, capabilities.open);
  });

  const go = useEventCallback((delta: 1 | -1) => {
    const next = index + delta;
    if (
      next < 0 ||
      next >= images.length ||
      store.getState().phase === "closing"
    )
      return;
    onIndexChange(next);
  });

  const run = useEventCallback((action: ViewerAction) => {
    switch (action) {
      case "close":
        if (store.getState().sheet) ctl.setSheet(false);
        else requestClose();
        return;
      case "zoom-in":
        return ctl.step(1);
      case "zoom-out":
        return ctl.step(-1);
      case "fit":
        return ctl.toFit(true);
      case "actual-size":
        return ctl.actualSize();
      case "previous":
        return go(-1);
      case "next":
        return go(1);
      case "copy":
        void copy();
        return;
      case "shortcuts":
        return ctl.setSheet(!store.getState().sheet);
    }
  });

  // The global shortcut manager listens on `window`; this portal lives in
  // <body>, so stopping every keydown here keeps app shortcuts (Esc leaving
  // solo mode, ⌘K…) from also firing while the viewer has focus.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (store.getState().phase === "closing") return;
    // Commit the controls before acting, so a Tab or a key zoom lands on
    // visible, focusable buttons rather than faded ones.
    if (store.getState().idle) flushSync(() => ctl.setIdle(false));
    if (e.key === "Tab") {
      if (rootRef.current) cycleFocus(e, rootRef.current);
    } else {
      const action = matchViewerKey(e);
      if (action) {
        e.preventDefault();
        run(action);
      }
    }
    // After the action, so a key zoom starts the idle countdown it caused.
    wake();
  };

  // --- render --------------------------------------------------------------
  const phase = ViewStore.useSelector((s) => s.phase, []);
  const idle = ViewStore.useSelector((s) => s.idle, []);
  const zoomed = ViewStore.useSelector(
    (s) =>
      s.natural !== null &&
      s.area !== null &&
      isZoomed(s.view, s.natural, s.area),
    [],
  );
  const dragging = ViewStore.useSelector((s) => s.dragging, []);
  const natural = ViewStore.useSelector((s) => s.natural, []);
  const failed = ViewStore.useSelector((s) => s.failed, []);

  return (
    <ViewportOverlay
      ref={rootRef}
      layer="popover"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${current.name}`}
      tabIndex={-1}
      className="outline-none"
      onKeyDown={onKeyDown}
      onPointerMove={wake}
    >
      {/* Image viewers are dark by convention, whatever the app's theme: the
          photo is the content and the chrome should recede. There is no scoped
          color-mode primitive (per-scope dark is deferred — see the theme
          skill), so this box opts into the theme's own `.dark` token block by
          class: the global dark palette ThemeInjector emits is selected on
          `.dark`, which re-declares every token on this element, and `dark:`
          variants key on a `.dark` ancestor. It sits INSIDE the portal root
          (which may carry an app's `data-theme-scope` block at equal
          specificity) so it wins by being the nearer declaration. */}
      <Layer
        className="dark group/viewer text-foreground"
        data-phase={phase}
        data-chrome={phase !== "open" || idle ? "hidden" : "shown"}
        data-zoomed={zoomed}
        data-dragging={dragging}
      >
        <Layer
          decorative
          className="bg-background/95 opacity-0 transition-opacity duration-300 group-data-[phase=open]/viewer:opacity-100"
        />
        <Layer
          ref={stageRef}
          className="touch-none select-none group-data-[zoomed=true]/viewer:cursor-grab group-data-[dragging=true]/viewer:cursor-grabbing"
          onPointerDown={(e) =>
            gestures.pointerDown(e.nativeEvent, e.currentTarget, imgRef.current)
          }
          onPointerMove={(e) =>
            gestures.pointerMove(e.nativeEvent, e.currentTarget)
          }
          onPointerUp={(e) => {
            gestures.pointerUp(e.nativeEvent, e.currentTarget);
            wake();
          }}
          onPointerCancel={(e) =>
            gestures.pointerCancel(e.nativeEvent, e.currentTarget)
          }
        >
          {natural === null && !failed && (
            <Center className="size-full">
              <Loading variant="spinner" />
            </Center>
          )}
          {failed && (
            <Center className="size-full">
              <Placeholder>Couldn&apos;t load this image.</Placeholder>
            </Center>
          )}
          <img
            key={shown.generation}
            ref={setImg}
            src={shown.image.src}
            alt={shown.image.alt ?? shown.image.name}
            draggable={false}
            onLoad={(e) =>
              ctl.loaded({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            onError={() => ctl.failedToLoad()}
            className={cn(
              placedClasses(),
              "max-w-none origin-top-left cursor-zoom-in shadow-2xl will-change-transform",
              "group-data-[zoomed=true]/viewer:cursor-grab group-data-[dragging=true]/viewer:cursor-grabbing",
            )}
            style={{
              ...placedStyle({ start: 0 }, { start: 0 }),
              ...(natural
                ? { width: natural.width, height: natural.height }
                : {}),
            }}
          />
        </Layer>
        <ControlSizeProvider size="md">
          <TopBar
            image={shown.image}
            index={index}
            count={images.length}
            capabilities={capabilities}
            compact={compact}
            onOpen={open}
            onCopy={copy}
            onDownload={download}
            onClose={requestClose}
          />
          <NavArrows
            index={index}
            count={images.length}
            onPrevious={() => go(-1)}
            onNext={() => go(1)}
          />
          <BottomBar ctl={ctl} />
          {!compact && <Minimap image={shown.image} ctl={ctl} />}
        </ControlSizeProvider>
      </Layer>
    </ViewportOverlay>
  );
}
