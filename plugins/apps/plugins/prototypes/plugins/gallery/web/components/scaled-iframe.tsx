import { useMemo, useState } from "react";
import { useElementSize } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { layerClasses } from "@plugins/primitives/plugins/css/plugins/layer/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * A prototype mounted in a sandboxed iframe, scaled to fit its container.
 *
 * **A new `src` never blanks the stage.** A prototype renders client-side
 * (inline JSX through Babel), so a frame that navigates in place is empty from
 * the moment its new document commits until that document has rendered —
 * a visible flash on every step of the version stepper and every live reload.
 * So the new document loads in a SECOND frame, hidden on top of the one on
 * screen, and replaces it on `load`. The frames are keyed by `src` and the
 * incoming one is always rendered after the one on screen, so promoting it
 * only removes its predecessor — React never moves the loaded frame's DOM node,
 * which would reload it.
 *
 * The container is the scaling box: it measures its own size and computes a
 * scale that fits the prototype's fixed `viewport`, never upscaling past 1 —
 * unless `upscale` is set, which presentation surfaces pass so the prototype
 * grows to fill a screen instead of sitting small in the middle of it.
 * The iframe is a rigid leaf fixed at the prototype's native `viewport` size,
 * shrunk via `transform: scale()` (the old `Stage`). The inner wrapper reserves
 * the scaled-down layout box so the iframe sits flush at the top-left.
 *
 * `src` is the prototype document URL from `usePrototypeSrc` — never built
 * here. It carries the edit cache-bust (a file edit → watcher → version bump →
 * new `src` → the iframe reloads) and the picked options.
 */
export function ScaledIframe({
  meta,
  src,
  title,
  upscale = false,
}: {
  meta: PrototypeMeta;
  /** The prototype's document URL, from `usePrototypeSrc`. */
  src: string;
  /**
   * The frame's accessible name. Defaults to the prototype's own `<title>` —
   * never `meta.name`, which is a minted id and would read out as
   * "proto-1786877040-w2vi" to a screen reader.
   */
  title?: string;
  /** Allow a scale above 1, so the prototype fills a larger presentation area. */
  upscale?: boolean;
}) {
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  // The document on screen. `src` differing from it means a new one is loading.
  const [shownSrc, setShownSrc] = useState(src);
  const frames = shownSrc === src ? [src] : [shownSrc, src];
  // Default to 1 (not 0): the iframe must ALWAYS mount so it loads, even before
  // the container is measured — gating it behind a measured scale meant a 0-size
  // mount (a ResizeObserver timing race) left the frame permanently absent. The
  // observer only ever refines the scale down to fit; overflow-hidden clips the
  // at-most-one-frame overshoot before it settles.
  const scale = useMemo(() => {
    if (!width || !height) return 1;
    const fit = Math.min(width / meta.viewport.w, height / meta.viewport.h);
    return upscale ? fit : Math.min(fit, 1);
  }, [width, height, meta.viewport.w, meta.viewport.h, upscale]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      // The scaling box centers the scaled prototype; overflow-hidden clips any
      // sub-pixel transform bleed. Inline styles (not banned className utils).
      style={{
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        // The positioning context the incoming frame's layer covers.
        className="relative"
        style={{
          width: meta.viewport.w * scale,
          height: meta.viewport.h * scale,
          overflow: "hidden",
        }}
      >
        {frames.map((frameSrc) => {
          const loading = frameSrc !== shownSrc;
          return (
            <iframe
              key={frameSrc}
              title={title ?? meta.title}
              src={frameSrc}
              // allow-same-origin keeps the frame on our own origin, so a prototype
              // that fetch()es one of its own flat files (a `data.json`, say) works
              // here exactly as it does when the file is opened off disk — without
              // it the frame is a null origin and every such fetch is blocked.
              // Safe here: prototypes are first-party files, authored on this
              // machine and served from the user's own ~/.singularity/apps/prototypes/.
              sandbox="allow-scripts allow-same-origin"
              width={meta.viewport.w}
              height={meta.viewport.h}
              // The incoming frame is invisible and out of the accessibility
              // tree until it has loaded; `load` then makes it the one shown.
              aria-hidden={loading || undefined}
              tabIndex={loading ? -1 : undefined}
              onLoad={loading ? () => setShownSrc(frameSrc) : undefined}
              // The frame on screen sits in flow; the incoming one is a layer
              // over it (anchored top-left — its own width/height win over the
              // inset), and drops back into flow when promoted. A class/style
              // change, never a remount, so the promoted document stays loaded.
              className={loading ? layerClasses() : undefined}
              style={{
                border: "0",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                display: "block",
                visibility: loading ? "hidden" : "visible",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
