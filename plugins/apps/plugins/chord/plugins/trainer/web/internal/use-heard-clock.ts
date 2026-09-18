import { useCallback, useEffect, useRef } from "react";
import type { YouTubePlayerController } from "@plugins/integrations/plugins/youtube/web";
import { finishedBoxes, type Round } from "../../core";

/**
 * When each box's chord first finished sounding in this round — the start of
 * its answer clock (plan "How a round works", step 5).
 *
 * Watches the playhead (one read per animation frame, only while the video
 * plays) and stamps `performance.now()` on each box the first time the
 * playhead crosses its end — or, for the loop's last chord, the first time the
 * loop wraps from just short of it. Nothing re-renders: the stamps live in a
 * ref and are read by the fill handler, as `heardAt(position)` (null while the
 * chord has not finished sounding yet).
 *
 * The stamps restart whenever `round` changes. `round` null watches nothing.
 */
export function useHeardClock(
  controller: YouTubePlayerController,
  round: Round | null,
): (position: number) => number | null {
  const heard = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    heard.current = new Map();
    if (round === null) return;
    const stamps = heard.current;
    let prev: number | null = null;
    return controller.subscribePlayhead(() => {
      const t = controller.getPlayhead();
      if (t === null) {
        prev = null;
        return;
      }
      if (prev !== null && t !== prev) {
        const now = performance.now();
        for (const position of finishedBoxes(round.boxes, prev, t)) {
          if (!stamps.has(position)) stamps.set(position, now);
        }
      }
      prev = t;
    });
  }, [controller, round]);

  return useCallback(
    (position: number) => heard.current.get(position) ?? null,
    [],
  );
}
