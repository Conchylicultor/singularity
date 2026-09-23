import { useState } from "react";
import { layerClasses } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { usePageHeight } from "../internal/use-page-height";

/**
 * A prototype document in a sandboxed iframe, laid out at the canvas's LOGICAL
 * size (so the page's own media queries run at that width) and shrunk or grown
 * on screen by `scale`.
 *
 * **A new `src` never blanks the frame.** A prototype renders client-side
 * (inline JSX through Babel), so a frame that navigates in place is empty from
 * the moment its new document commits until that document has rendered — a
 * visible flash on every version step, variant pick and live reload. So the new
 * document loads in a SECOND frame, hidden on top of the one on screen, and
 * replaces it on `load`. The frames are keyed by `src` and the incoming one is
 * always rendered after the one on screen, so promoting it only removes its
 * predecessor — React never moves the loaded frame's DOM node, which would
 * reload it.
 *
 * With `wholePage`, the frame is as tall as its own document (measured at the
 * logical `height`, see `usePageHeight`, and reported through `onPageHeight` so
 * the canvas can fit every frame to the tallest page); otherwise it is one
 * screen tall and the page scrolls inside it.
 */
export function PrototypeFrame({
  src,
  title,
  width,
  height,
  scale,
  wholePage,
  pageHeight,
  onPageHeight,
}: {
  /** The document's URL, from `useFrameSrc` — never built here. */
  src: string;
  /** The frame's accessible name: the prototype's `<title>`, never its id. */
  title: string;
  width: number;
  height: number;
  scale: number;
  wholePage: boolean;
  /** This document's measured full height, when Whole page is on. */
  pageHeight: number | null;
  onPageHeight: (height: number) => void;
}) {
  // The document on screen. `src` differing from it means a new one is loading.
  const [shownSrc, setShownSrc] = useState(src);
  const frames = shownSrc === src ? [src] : [shownSrc, src];
  // The document on screen once it has loaded — what Whole page measures.
  const [ready, setReady] = useState<{
    frame: HTMLIFrameElement;
    doc: Document;
  } | null>(null);
  usePageHeight(ready, height, wholePage, onPageHeight);
  const docHeight = wholePage && pageHeight !== null ? pageHeight : height;

  return (
    <div
      // The positioning context the incoming frame's layer covers; sized to
      // the scaled document so the scroll box around it knows its extent.
      className="relative"
      style={{
        width: width * scale,
        height: docHeight * scale,
        // The iframe keeps its unscaled layout box; clip it to the scaled one.
        overflow: "hidden",
      }}
    >
      {frames.map((frameSrc) => {
        const loading = frameSrc !== shownSrc;
        return (
          <iframe
            key={frameSrc}
            title={title}
            src={frameSrc}
            // allow-same-origin keeps the frame on our own origin, so a
            // prototype that fetch()es one of its own flat files works here
            // exactly as it does off disk. Safe: prototypes are first-party
            // files, authored on this machine and served from the user's own
            // ~/.singularity/apps/prototypes/.
            sandbox="allow-scripts allow-same-origin"
            width={width}
            height={docHeight}
            // The incoming frame is invisible and out of the accessibility
            // tree until it has loaded; `load` then makes it the one shown.
            aria-hidden={loading || undefined}
            tabIndex={loading ? -1 : undefined}
            onLoad={(e) => {
              const frame = e.currentTarget;
              const doc = frame.contentDocument;
              // allow-same-origin (above) is what makes this readable.
              if (!doc) throw new Error("prototype frame is not same-origin");
              setShownSrc(frameSrc);
              setReady({ frame, doc });
            }}
            // The incoming frame is a layer over the one on screen, and drops
            // back into flow when promoted — a class change, never a remount.
            className={loading ? layerClasses() : undefined}
            style={{
              border: "0",
              display: "block",
              transform: `scale(${String(scale)})`,
              transformOrigin: "top left",
              visibility: loading ? "hidden" : "visible",
            }}
          />
        );
      })}
    </div>
  );
}
