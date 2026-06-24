import { useMemo } from "react";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import { prototypeUrl, type PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * A prototype mounted in a sandboxed iframe, scaled to fit its container.
 *
 * The container is the scaling box: it measures its own size and computes a
 * scale that fits the prototype's fixed `viewport`, never upscaling past 1.
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
}: {
  meta: PrototypeMeta;
  version: number;
  title?: string;
}) {
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  // Default to 1 (not 0): the iframe must ALWAYS mount so it loads, even before
  // the container is measured — gating it behind a measured scale meant a 0-size
  // mount (a ResizeObserver timing race) left the frame permanently absent. The
  // observer only ever refines the scale down to fit; overflow-hidden clips the
  // at-most-one-frame overshoot before it settles.
  const scale = useMemo(
    () =>
      width && height
        ? Math.min(width / meta.viewport.w, height / meta.viewport.h, 1)
        : 1,
    [width, height, meta.viewport.w, meta.viewport.h],
  );

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
          // allow-same-origin is required for the harness to fetch() the
          // prototype's meta.json + source files from our own /api/prototypes
          // origin (without it the frame is a null origin and fetch is blocked).
          // Safe here: prototypes are first-party files served from our repo.
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
