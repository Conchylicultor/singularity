import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  createVelocityTracker,
  flingPosition,
  flingVelocity,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/core";

export interface InertialDragConfig {
  axis: "x" | "y";
  /** Convert pointer pixels → value units (sign sets direction). e.g. 1/pxPerSecond. */
  unitsPerPixel: number;
  /** Inclusive clamp for the emitted value, in units. Motion hard-stops at a bound. */
  bounds: readonly [min: number, max: number];
  /** Value at the instant a grab begins — resync point with the consumer's live state. Sampled once per grab. */
  origin: () => number;
  /** Called every frame of drag AND fling with the new absolute clamped value. */
  onScrub: (value: number) => void;
  /** Motion begins (pointer down). */
  onGrab?: () => void;
  /** All motion stopped (release with no fling, or fling came to rest). */
  onSettle?: () => void;
  /** Deceleration constant k (1/s). Higher = stops sooner. Default tuned (~5). */
  friction?: number;
  /** Pointer speed (px/s) below which a fling is considered already stopped. Default tuned (~10). */
  minVelocity?: number;
}

export interface InertialDragHandle {
  handlers: Pick<
    React.DOMAttributes<Element>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
  phase: "idle" | "dragging" | "flinging";
}

const DEFAULT_FRICTION = 5;
const DEFAULT_MIN_VELOCITY = 10;

/** Clamp a value to an inclusive `[min, max]` range, reporting whether it hit a bound. */
function clampToBounds(
  value: number,
  bounds: readonly [number, number],
): { value: number; atBound: boolean } {
  const [min, max] = bounds;
  if (value <= min) return { value: min, atBound: true };
  if (value >= max) return { value: max, atBound: true };
  return { value, atBound: false };
}

/**
 * One-dimensional drag-to-scrub with release momentum.
 *
 * Runs the physics internally in PIXEL space — `friction` and `minVelocity` are
 * therefore scale-invariant — and converts to the consumer's value units only at
 * emit time via `unitsPerPixel`, hard-clamped to `bounds`. A fling stops the
 * instant it hits a bound (no rubber-band). The hook OWNS the position during a
 * drag/fling: it reads `origin()` exactly once per grab and never again, so
 * there is no feedback loop with the consumer's live state.
 */
export function useInertialDrag(config: InertialDragConfig): InertialDragHandle {
  // Read live config through a ref so the returned handlers stay stable across
  // renders (the surface re-attaches nothing on every config change).
  const configRef = useLatestRef(config);

  const [phase, setPhase] = useState<InertialDragHandle["phase"]>("idle");

  const tracker = useRef(createVelocityTracker()).current;
  // Per-grab pointer-space anchor.
  const grab = useRef<{ startPixel: number; originValue: number } | null>(null);
  // In-flight fling animation frame.
  const flingRaf = useRef<number | null>(null);

  const cancelFling = useCallback(() => {
    if (flingRaf.current !== null) {
      cancelAnimationFrame(flingRaf.current);
      flingRaf.current = null;
    }
  }, []);

  const axisPixel = useCallback(
    (e: { clientX: number; clientY: number }): number =>
      configRef.current.axis === "y" ? e.clientY : e.clientX,
    [configRef],
  );

  /** Map a pixel position to the clamped unit value, reporting a bound-hit. */
  const toValue = useCallback((pixel: number): { value: number; atBound: boolean } => {
    const g = grab.current!;
    const { unitsPerPixel, bounds } = configRef.current;
    const raw = g.originValue + (pixel - g.startPixel) * unitsPerPixel;
    return clampToBounds(raw, bounds);
  }, [configRef]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<Element>) => {
      // Grab-to-catch: an in-flight fling stops the instant the surface is grabbed.
      cancelFling();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pixel = axisPixel(e);
      grab.current = {
        startPixel: pixel,
        originValue: configRef.current.origin(),
      };
      tracker.reset();
      tracker.sample(e.timeStamp, pixel);
      configRef.current.onGrab?.();
      setPhase("dragging");
    },
    [axisPixel, cancelFling, tracker, configRef],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<Element>) => {
      // Only while the primary button is held (a live drag).
      if (!grab.current || (e.buttons & 1) === 0) return;
      const pixel = axisPixel(e);
      const { value } = toValue(pixel);
      configRef.current.onScrub(value);
      tracker.sample(e.timeStamp, pixel);
    },
    [axisPixel, toValue, tracker, configRef],
  );

  const release = useCallback(
    (e: React.PointerEvent<Element>) => {
      const g = grab.current;
      if (!g) return;
      grab.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const friction = configRef.current.friction ?? DEFAULT_FRICTION;
      const minVelocity = configRef.current.minVelocity ?? DEFAULT_MIN_VELOCITY;
      const v0 = tracker.velocity(); // px/s, signed in the drag direction.

      // Below the threshold → no coast: settle immediately at the current value.
      if (Math.abs(v0) < minVelocity) {
        setPhase("idle");
        configRef.current.onSettle?.();
        return;
      }

      // Decay rAF: sample the closed-form fling by elapsed wall-time so it is
      // frame-rate-independent. The grab anchor stays live for `toValue`.
      grab.current = g;
      setPhase("flinging");
      const releasePixel = axisPixel(e);
      const releaseTime = performance.now();

      const step = () => {
        const t = (performance.now() - releaseTime) / 1000;
        const pixel = flingPosition(releasePixel, v0, friction, t);
        const { value, atBound } = toValue(pixel);
        configRef.current.onScrub(value);

        const stopped =
          Math.abs(flingVelocity(v0, friction, t)) < minVelocity || atBound;
        if (stopped) {
          flingRaf.current = null;
          grab.current = null;
          setPhase("idle");
          configRef.current.onSettle?.();
          return;
        }
        flingRaf.current = requestAnimationFrame(step);
      };
      flingRaf.current = requestAnimationFrame(step);
    },
    [axisPixel, toValue, tracker, configRef],
  );

  // Cancel any in-flight fling on unmount.
  useEffect(() => cancelFling, [cancelFling]);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
    },
    phase,
  };
}
