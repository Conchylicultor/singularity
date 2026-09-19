import {
  bars,
  scoreEndBeat,
  type Score,
  type SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { LoopRange } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Pure A–B-loop helpers shared by the toolbar toggle, the keyboard shortcuts,
 * and the draggable region — so every entry point agrees on one definition of
 * "snap", "default range", and "toggle" (one name per concept). No React here;
 * the components feed in the live `loop`/`score`/`beat` and the transport verbs.
 */

/** How many bars a default loop spans when the playhead isn't inside a section. */
const DEFAULT_BARS = 4;

/**
 * The default loop region for a one-tap "loop from here": the section the
 * playhead sits in if any, else the current bar extended `DEFAULT_BARS` bars
 * forward — both clamped to the song span. Returns `null` on an empty score.
 */
export function defaultLoopAt(score: Score, beat: number): LoopRange | null {
  const end = scoreEndBeat(score);
  if (end <= 0) return null;

  // Inside a section → drill that whole section.
  const section = score.annotations.find(
    (a): a is SectionAnnotation =>
      a.type === "section" && beat >= a.start && beat < a.end,
  );
  if (section) {
    return { start: section.start, end: section.end, enabled: true };
  }

  // Otherwise: the current bar extended DEFAULT_BARS bars forward, clamped.
  const lines = bars(score);
  // The last bar line at or before the playhead is the current bar's start.
  let curIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startBeat <= beat) curIdx = i;
    else break;
  }
  const start = lines[curIdx]?.startBeat ?? 0;
  const target = lines[curIdx + DEFAULT_BARS]?.startBeat ?? end;
  return { start, end: Math.min(end, target), enabled: true };
}

/**
 * Snap a beat to the nearest loop boundary: a bar line (`bars(score)`) or the
 * song's end. The end is a target in its own right because `bars()` lists bar
 * STARTS only — a song whose last bar is cut short (or simply ends mid-bar)
 * has no bar line at its end, so without it a loop's `B` could never reach the
 * end of the song. Callers bypass this when Alt is held, for fine off-grid
 * placement.
 */
export function snapToBars(beat: number, score: Score): number {
  const targets = [...bars(score).map((b) => b.startBeat), scoreEndBeat(score)];
  let nearest = targets[0]!;
  for (const t of targets) {
    if (Math.abs(beat - t) < Math.abs(beat - nearest)) nearest = t;
  }
  return nearest;
}

/**
 * Toggle the practice loop: if a region already exists, flip its `enabled`
 * (keeping the bounds visible either way); otherwise create the default region
 * at `beat` and seek to its start so playback drills from A immediately.
 */
export function toggleLoop({
  loop,
  setLoop,
  seekTo,
  score,
  beat,
}: {
  loop: LoopRange | null;
  setLoop: (next: LoopRange | null) => void;
  seekTo: (beat: number) => void;
  score: Score;
  beat: number;
}): void {
  if (loop) {
    setLoop({ ...loop, enabled: !loop.enabled });
    return;
  }
  const next = defaultLoopAt(score, beat);
  if (!next) return;
  setLoop(next);
  seekTo(next.start);
}
