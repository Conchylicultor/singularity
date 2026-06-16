/**
 * PianoRollCanvas — the React ↔ Pixi bridge. Owns the `Application` lifecycle
 * and forwards every prop change to the imperative {@link PianoRollScene}
 * handle through narrow, separately-keyed layout effects. The per-frame cursor
 * is NOT a prop: the parent subscribes to the cursor store and calls
 * `scene.setScroll` directly (see piano-roll.tsx `applyCursor`), so a frame
 * never re-renders this component. These effects fire only on real input
 * changes (resize, score, seek, labels, theme).
 *
 * LIFECYCLE (the #1 Pixi-v8-in-React footgun): `Application.init()` is async,
 * but StrictMode double-mounts effects synchronously — destroying the app
 * before init settles crashes inside Pixi, and destroying it never leaks a
 * WebGL context. The fix is the plan's disposed-flag pattern: cleanup flips
 * `disposed` immediately (so the init continuation becomes a no-op) and chains
 * the actual destroy AFTER the init promise settles.
 *
 * The canvas is transparent (`backgroundAlpha: 0` — the lane's `bg-background`
 * shows through, making the background theme-reactive for free) and inert
 * (`pointer-events: none`, all Pixi event features off) — drag-to-scrub and
 * every other interaction stays on the DOM lane wrapper.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import type { Note } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { NoteVisual } from "../../components/geometry";
import type { BarMarker, PitchLine } from "./grid";
import { createPianoRollScene, type PianoRollScene } from "./scene";
import { watchThemeColors } from "./css-color";

export interface PianoRollCanvasProps {
  /** Lane size in CSS px (from the lane's ResizeObserver). */
  width: number;
  height: number;
  /** Cursor-invariant note geometry (authored space; see geometry.ts). */
  visuals: NoteVisual[];
  bars: BarMarker[];
  pitchLines: PitchLine[];
  /** Beat-domain notes for the onset tracker (see scene.ts bridge note). */
  scoreNotes: Note[];
  showLabels: boolean;
  tempoScale: number;
  /** Vertical zoom (1 = base). Pushed to the scene as one rescale. */
  spread: number;
  /**
   * Fired with the live scene + app pair once init settles, and with null on
   * teardown. The app rides along because the FX context needs its ticker and
   * renderer (texture generation) — see fx-context.ts.
   */
  onSceneReady: (pixi: { scene: PianoRollScene; app: Application } | null) => void;
  /**
   * Fired when the GPU context/device is lost AFTER a successful init (a sleep/
   * wake, GPU-process reset, or driver hiccup on a long-lived tab). Pixi v8 does
   * not recover from a spontaneous loss on its own — the WebGPU device system
   * never subscribes to `device.lost`, and the WebGL system only auto-restores a
   * loss it forced — so the canvas would go permanently blank (the DOM overlays
   * keep rendering, hence "notes don't show"). The parent responds by remounting
   * this component (a fresh `key`), which tears the dead app down and rebuilds a
   * working one from the current props.
   */
  onContextLost: () => void;
}

/**
 * Watch a live Pixi app for a spontaneous GPU context/device loss and invoke
 * `onLost` exactly once. Both backends are covered:
 *  - WebGL — the canvas fires `webglcontextlost`; we `preventDefault()` (so the
 *    browser keeps the canvas around) and rebuild rather than hoping for an
 *    auto-restore Pixi only performs for losses it forced itself.
 *  - WebGPU — the device exposes a `lost` promise Pixi never listens to; a
 *    `reason` of `"destroyed"` is our own teardown (`app.destroy`) and is
 *    ignored, anything else is a real loss.
 * Returns a detach function for the WebGL listener (the WebGPU promise can't be
 * un-awaited, so the guard below de-dupes and the disposed flag drops late ones).
 */
function watchContextLoss(app: Application, onLost: () => void): () => void {
  let fired = false;
  const fire = (): void => {
    if (fired) return;
    fired = true;
    // Stop the ticker before anything else: rendering a frame against the dead
    // context throws inside Pixi's render loop (it would keep firing until React
    // unmounts us). Halting it makes the rebuild clean.
    app.stop();
    onLost();
  };

  const canvas = app.canvas;
  const onGlLost = (e: Event): void => {
    e.preventDefault();
    fire();
  };
  canvas.addEventListener("webglcontextlost", onGlLost);

  // WebGPU device-loss: `renderer.gpu` holds `{ adapter, device }` on the WebGPU
  // backend and is undefined on WebGL — the optional chain guards both.
  const device = (
    app.renderer as { gpu?: { device?: { lost?: Promise<{ reason: string }> } } }
  ).gpu?.device;
  if (device?.lost) {
    void device.lost.then((info) => {
      if (info.reason !== "destroyed") fire();
    });
  }

  return () => canvas.removeEventListener("webglcontextlost", onGlLost);
}

export function PianoRollCanvas(props: PianoRollCanvasProps) {
  const {
    width,
    height,
    visuals,
    bars,
    pitchLines,
    scoreNotes,
    showLabels,
    tempoScale,
    spread,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  // The scene lives in STATE (not just a ref) so the prop-forwarding effects
  // below re-fire once init settles and push the then-current props.
  const [scene, setScene] = useState<PianoRollScene | null>(null);
  // Latest callbacks without retriggering the init effect.
  const onSceneReadyRef = useRef(props.onSceneReady);
  onSceneReadyRef.current = props.onSceneReady;
  const onContextLostRef = useRef(props.onContextLost);
  onContextLostRef.current = props.onContextLost;

  useEffect(() => {
    let disposed = false;
    let liveScene: PianoRollScene | null = null;
    let detachLoss = (): void => {};
    const app = new Application();
    const ready = app
      .init({
        preference: "webgpu",
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
        // Accept a software WebGL context as a last resort: on a machine with no
        // WebGPU and no hardware WebGL, a slow canvas WITH notes beats Pixi's
        // default of bailing out (failIfMajorPerformanceCaveat = true) and
        // leaving the lane blank. Auto-detect still prefers WebGPU → hardware
        // WebGL first; this only relaxes the final fallback.
        failIfMajorPerformanceCaveat: false,
        eventFeatures: {
          move: false,
          globalMove: false,
          click: false,
          wheel: false,
        },
      })
      .then(() => {
        if (disposed) return;
        const host = hostRef.current;
        if (!host) {
          throw new Error("PianoRollCanvas: host div vanished before init settled");
        }
        // Backend visibility: headless e2e exercises the WebGL fallback, real
        // Chrome should pick WebGPU — log which one actually initialized.
        console.info(`[piano-roll] pixi backend: ${app.renderer.name}`);
        clientLog("piano-roll", `pixi backend: ${app.renderer.name}`);
        app.canvas.style.pointerEvents = "none";
        host.appendChild(app.canvas);
        liveScene = createPianoRollScene(app);
        setScene(liveScene);
        onSceneReadyRef.current({ scene: liveScene, app });
        // Self-heal a spontaneous GPU loss: Pixi won't, so we ask the parent to
        // remount us and rebuild the app from the current props.
        detachLoss = watchContextLoss(app, () => {
          clientLog("piano-roll", "gpu context lost — reinitializing canvas");
          onContextLostRef.current();
        });
      });
    return () => {
      disposed = true;
      detachLoss();
      // Destroy only after init settles — tearing down mid-init crashes Pixi.
      void ready.then(() => {
        // Signal null only if WE published a scene: a StrictMode-killed first
        // instance never published (disposed flag), and its late cleanup must
        // not clobber the second instance's live handle.
        if (liveScene) {
          onSceneReadyRef.current(null);
          setScene(null);
          liveScene.destroy();
        }
        app.destroy(true, { children: true });
      });
    };
  }, []);

  // Each concern is its own effect so a change touches exactly one scene call.
  // Declaration order matters on the first scene-ready pass: size before score
  // (label layout needs the lane size) before the parent's scroll re-sync.
  useLayoutEffect(() => {
    if (!scene || width <= 0 || height <= 0) return;
    // Re-read DPR every resize: a window move across monitors changes it
    // without any React prop changing size.
    scene.resize(width, height, window.devicePixelRatio);
  }, [scene, width, height]);

  useLayoutEffect(() => {
    if (!scene) return;
    scene.setScore({ notes: visuals, bars, pitchLines, scoreNotes, tempoScale });
  }, [scene, visuals, bars, pitchLines, scoreNotes, tempoScale]);

  // No per-frame cursor effect and no seek-reset effect here: the parent
  // subscribes to the cursor store and calls `scene.setScroll` imperatively
  // (piano-roll.tsx `applyCursor`), re-anchoring the onset tracker via
  // `scene.reset()` when the store flags the change a seek. So a playback frame
  // never re-renders this component; on scene-ready the parent re-syncs once via
  // its own layout effect.

  useLayoutEffect(() => {
    if (!scene) return;
    scene.setShowLabels(showLabels);
  }, [scene, showLabels]);

  // Vertical zoom. Runs after resize (which seeds the lane size the rescale
  // reads); the parent's cursor re-sync layout effect then re-glues the scroll.
  useLayoutEffect(() => {
    if (!scene) return;
    scene.setSpread(spread);
  }, [scene, spread]);

  useEffect(() => {
    if (!scene) return;
    return watchThemeColors(() => scene.refreshColors());
  }, [scene]);

  return <div ref={hostRef} className="pointer-events-none absolute inset-0" />;
}
