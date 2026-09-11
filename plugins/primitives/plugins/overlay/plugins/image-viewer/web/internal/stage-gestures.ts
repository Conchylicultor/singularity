import type { ScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import { DRAG_THRESHOLD, wheelZoomFactor, type View } from "../../core";
import type { ViewController } from "./view-controller";
import type { ViewState } from "./view-store";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A press that may become a drag. */
interface Press {
  readonly start: Point;
  readonly from: View;
  readonly onImage: boolean;
  moved: boolean;
}

/** Two fingers down: the distance and scale when the pinch began. */
interface Pinch {
  readonly distance: number;
  readonly scale: number;
}

/** Stage pixel under a client point. */
function toStage(stage: HTMLElement, clientX: number, clientY: number): Point {
  const r = stage.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pointer and wheel input on the stage, turned into controller calls:
 *
 * - a click on the image toggles fit ↔ the detail scale at that spot;
 * - a click on the backdrop closes — unless zoomed, where it is just a miss;
 * - a drag pans (only when zoomed: at fit there is nothing to pan to);
 * - two pointers pinch-zoom around their midpoint;
 * - the wheel zooms around the pointer.
 *
 * Plain closures over the press state, created once per viewer: none of this
 * renders anything, and it runs on every pointer move.
 */
export function createStageGestures(
  ctl: ViewController,
  store: ScopedStore<ViewState>,
  onDismiss: () => void,
) {
  const pointers = new Map<number, Point>();
  let press: Press | null = null;
  let pinch: Pinch | null = null;

  const interactive = () => store.getState().phase === "open";

  function end(e: PointerEvent, isUp: boolean, stage: HTMLElement) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    ctl.setDragging(false);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      press = null;
      return;
    }
    const p = press;
    press = null;
    if (!p || p.moved || !isUp) return;
    const at = toStage(stage, e.clientX, e.clientY);
    if (p.onImage) ctl.toggleDetail(at.x, at.y);
    else if (!ctl.isZoomed()) onDismiss();
  }

  return {
    pointerDown(e: PointerEvent, stage: HTMLElement, img: Element | null) {
      if (e.button !== 0 || !interactive()) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        press = {
          start: { x: e.clientX, y: e.clientY },
          from: store.getState().view,
          onImage:
            img !== null && e.target instanceof Node && img.contains(e.target),
          moved: false,
        };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        pinch = {
          distance: distance(a, b),
          scale: store.getState().view.scale,
        };
        press = null;
      }
    },

    pointerMove(e: PointerEvent, stage: HTMLElement) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        const mid = toStage(stage, (a.x + b.x) / 2, (a.y + b.y) / 2);
        ctl.zoomTo(
          (pinch.scale * distance(a, b)) / pinch.distance,
          mid.x,
          mid.y,
          false,
        );
        return;
      }
      if (!press) return;
      const dx = e.clientX - press.start.x;
      const dy = e.clientY - press.start.y;
      if (!press.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        press.moved = true;
        if (ctl.isZoomed()) ctl.setDragging(true);
      }
      if (press.moved && ctl.isZoomed()) ctl.pan(press.from, dx, dy);
    },

    pointerUp(e: PointerEvent, stage: HTMLElement) {
      end(e, true, stage);
    },

    pointerCancel(e: PointerEvent, stage: HTMLElement) {
      end(e, false, stage);
    },

    /** Registered non-passive by the caller, so this may `preventDefault` —
     *  otherwise the wheel would scroll (or, pinched, zoom) the page below. */
    wheel(e: WheelEvent, stage: HTMLElement) {
      e.preventDefault();
      if (!interactive()) return;
      const at = toStage(stage, e.clientX, e.clientY);
      ctl.zoomBy(wheelZoomFactor(e), at.x, at.y);
    },
  };
}

export type StageGestures = ReturnType<typeof createStageGestures>;
