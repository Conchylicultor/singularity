import type { ReactElement } from "react";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * The prototype, live and interactive, laid out at the width the stage picked.
 *
 * Deliberately NOT `ScaledIframe`. That one mounts the prototype at its own
 * declared viewport and `transform: scale()`s the result to fit — so a 320px box
 * shows the 1280px layout shrunk, which is a picture of the wide design, not the
 * narrow one. The question this stage asks is "at THIS width, do these two
 * agree?", and only a frame that is genuinely that wide can answer it: the
 * prototype's own media queries and flex wrapping run, exactly as the real
 * component's do next to it.
 *
 * The cost is the honest one: a prototype authored at a fixed width does not
 * reflow, so at a narrower width it crops and scrolls inside its frame instead
 * of rearranging. That IS the comparison's answer — the mock has nothing to say
 * about this width — and it stays visible rather than being hidden behind a
 * scale factor that makes every width look designed for.
 *
 * Height is the prototype's own declared viewport height. An iframe never sizes
 * to its content, and the prototype already states how tall it means to be.
 *
 * `src` is the pane's one URL for the prototype's document (`usePrototypeSrc`):
 * it cache-busts exactly as every other frame does, so an agent's edit reloads
 * this one live, and it carries the picked options, so the mock half shows the
 * variant the reader is looking at.
 */
export function MockFrame({
  meta,
  src,
  height,
}: {
  meta: PrototypeMeta;
  src: string;
  height: number;
}): ReactElement {
  return (
    <iframe
      // The prototype's own <title>, never `meta.name` — that is a minted id and
      // would read out as "proto-1786877040-w2vi" to a screen reader.
      title={meta.title}
      src={src}
      // Same sandbox posture as every other prototype frame in the app:
      // allow-same-origin keeps the frame on our own origin, so a prototype that
      // fetch()es one of its own flat files works here exactly as it does when
      // the file is opened off disk. Safe because prototypes are first-party
      // files, authored on this machine and served from the user's own
      // ~/.singularity/apps/prototypes/.
      sandbox="allow-scripts allow-same-origin"
      // Inline geometry, not banned className layout utilities: the width comes
      // from the frame's own box (100% of the width the stage sized it to), the
      // height from the prototype's declared viewport.
      style={{ border: "0", display: "block", width: "100%", height }}
    />
  );
}
