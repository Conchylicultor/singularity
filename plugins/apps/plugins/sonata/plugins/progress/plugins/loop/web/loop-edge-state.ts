import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useCursorSelector,
  useLaneInsets,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";

/** Which loop boundary an edge indicator stands for: A = start, B = end. */
export type LoopEdgeLetter = "A" | "B";

/**
 * The off-screen loop boundaries, bucketed by which lane edge they've scrolled
 * past. A boundary on-screen appears in NEITHER list (its content-space label
 * shows instead). Each list is ORDERED so the chip nearest the visible area
 * reads first: `top` is sorted by descending screen-Y (closest to the top edge
 * last-to-leave first), `bottom` by ascending screen-Y (closest to the now-line
 * first).
 */
export interface LoopEdgeBuckets {
  top: LoopEdgeLetter[];
  bottom: LoopEdgeLetter[];
}

/** Value-equality over the ordered bucket arrays, so the cursor selector bails
 *  out every frame the bucketing is unchanged (it builds a fresh object). */
function isEqualBuckets(a: LoopEdgeBuckets, b: LoopEdgeBuckets): boolean {
  return a.top.join("") === b.top.join("") && a.bottom.join("") === b.bottom.join("");
}

/**
 * Classifies each A–B loop boundary against the lane's on-screen window, given
 * the live cursor: a boundary is "top" if it has scrolled above the lookahead
 * (including under the HUD-reserved `topInset`), "bottom" if it's past the
 * now-line, else on-screen (skipped). View-only — derives purely from the
 * published projection + transport loop state.
 *
 * Re-render discipline: the cursor advances ~60fps, so this selects the COARSE
 * bucket result via {@link useCursorSelector} (value-compared with
 * {@link isEqualBuckets}) — it re-renders the caller only when a boundary
 * crosses an edge, never per frame. The edge chips themselves sit at a FIXED
 * lane edge, so no per-frame position update is needed.
 *
 * On-screen Y of a beat: `beatToY(beat) - beatToY(cursorBeat) + H` (see the
 * piano-roll geometry; `beatToY` is content-space and negative for future
 * beats, so subtracting the cursor's content-Y and adding the lane height `H`
 * maps the now-line to the lane bottom).
 */
export function useLoopEdgeBuckets(projection: Projection): LoopEdgeBuckets {
  const { loop } = useSonata();
  const { top: topInset } = useLaneInsets();
  const beatToY = projection.beatToY;
  const H = projection.viewport.height;

  return useCursorSelector<LoopEdgeBuckets>(
    (cursorBeat) => {
      if (!loop || !beatToY) return { top: [], bottom: [] };
      const boundaries = [
        { letter: "A" as const, beat: loop.start },
        { letter: "B" as const, beat: loop.end },
      ];
      const top: { letter: LoopEdgeLetter; s: number }[] = [];
      const bottom: { letter: LoopEdgeLetter; s: number }[] = [];
      for (const { letter, beat } of boundaries) {
        const s = beatToY(beat) - beatToY(cursorBeat) + H;
        if (s < topInset) top.push({ letter, s });
        else if (s > H) bottom.push({ letter, s });
        // else: on-screen → no edge chip (the content-space label shows).
      }
      // Order each cluster so the chip nearest the visible area reads first.
      top.sort((a, b) => b.s - a.s);
      bottom.sort((a, b) => a.s - b.s);
      return {
        top: top.map((x) => x.letter),
        bottom: bottom.map((x) => x.letter),
      };
    },
    [loop, beatToY, topInset, H],
    isEqualBuckets,
  );
}
