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
import type { BarMarker } from "./grid";
import { createPianoRollScene, type PianoRollScene } from "./scene";
import { watchThemeColors } from "./css-color";

export interface PianoRollCanvasProps {
  /** Lane size in CSS px (from the lane's ResizeObserver). */
  width: number;
  height: number;
  /** Cursor-invariant note geometry (authored space; see geometry.ts). */
  visuals: NoteVisual[];
  bars: BarMarker[];
  cBoundaryFracs: number[];
  /** Beat-domain notes for the onset tracker (see scene.ts bridge note). */
  scoreNotes: Note[];
  showLabels: boolean;
  tempoScale: number;
  /**
   * Fired with the live scene + app pair once init settles, and with null on
   * teardown. The app rides along because the FX context needs its ticker and
   * renderer (texture generation) — see fx-context.ts.
   */
  onSceneReady: (pixi: { scene: PianoRollScene; app: Application } | null) => void;
}

export function PianoRollCanvas(props: PianoRollCanvasProps) {
  const {
    width,
    height,
    visuals,
    bars,
    cBoundaryFracs,
    scoreNotes,
    showLabels,
    tempoScale,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  // The scene lives in STATE (not just a ref) so the prop-forwarding effects
  // below re-fire once init settles and push the then-current props.
  const [scene, setScene] = useState<PianoRollScene | null>(null);
  // Latest callback without retriggering the init effect.
  const onSceneReadyRef = useRef(props.onSceneReady);
  onSceneReadyRef.current = props.onSceneReady;

  useEffect(() => {
    let disposed = false;
    let liveScene: PianoRollScene | null = null;
    const app = new Application();
    const ready = app
      .init({
        preference: "webgpu",
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
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
      });
    return () => {
      disposed = true;
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
    scene.setScore({ notes: visuals, bars, cBoundaryFracs, scoreNotes, tempoScale });
  }, [scene, visuals, bars, cBoundaryFracs, scoreNotes, tempoScale]);

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

  useEffect(() => {
    if (!scene) return;
    return watchThemeColors(() => scene.refreshColors());
  }, [scene]);

  return <div ref={hostRef} className="pointer-events-none absolute inset-0" />;
}
