import { useMemo } from "react";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import {
  prototypeUrl,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * A prototype mounted in a sandboxed iframe, scaled to fit its container.
 *
 * The container is the scaling box: it measures its own size and computes a
 * scale that fits the prototype's fixed `viewport`, never upscaling past 1 —
 * unless `upscale` is set, which presentation surfaces pass so the prototype
 * grows to fill a screen instead of sitting small in the middle of it.
 * The iframe is a rigid leaf fixed at the prototype's native `viewport` size,
 * shrunk via `transform: scale()` (the old `Stage`). The inner wrapper reserves
 * the scaled-down layout box so the iframe sits flush at the top-left.
 *
 * `version` is appended to the src as a cache-bust so a file edit (watcher →
 * resource bump → re-render with a new version) reloads the iframe.
 */
export function ScaledIframe({
  meta,
  version,
  title,
  upscale = false,
}: {
  meta: PrototypeMeta;
  version: number;
  title?: string;
  /** Allow a scale above 1, so the prototype fills a larger presentation area. */
  upscale?: boolean;
}) {
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
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

  const src = prototypeUrl(meta.name, { v: version });

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
        style={{
          width: meta.viewport.w * scale,
          height: meta.viewport.h * scale,
          overflow: "hidden",
        }}
      >
        <iframe
          title={title ?? meta.name}
          src={src}
          // allow-same-origin keeps the frame on our own origin, so a prototype
          // that fetch()es one of its own flat files (a `data.json`, say) works
          // here exactly as it does when the file is opened off disk — without
          // it the frame is a null origin and every such fetch is blocked.
          // Safe here: prototypes are first-party files, authored on this
          // machine and served from the user's own ~/.singularity/prototypes/.
          sandbox="allow-scripts allow-same-origin"
          width={meta.viewport.w}
          height={meta.viewport.h}
          style={{
            border: "0",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            display: "block",
          }}
        />
      </div>
    </div>
  );
}
