import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { Blanks } from "./blanks";

// ── Which boxes wait for an answer ───────────────────────────────────────────
//
// Every box of a round shows a chord or waits for one. Only a PRACTISED chord's
// box can wait; the blanks setting says how many of those do. The rest are
// GIVEN: already showing their chord.

/** What the rule reads of one box of the round (see `trainer/core` `Box`). */
export type AskedBox = {
  /** The box's place in the round, 0-based, in beat order. */
  position: number;
  /** The chord that sounds there. */
  token: ChordToken;
  /** Beats from the window's start to the box's start. */
  gridStart: number;
};

export type AskedOptions = {
  /** The window's length in beats: `half` splits it down the middle. */
  windowBeats: number;
  blanks: Blanks;
  /** The chords the learner practises: only their boxes can be blank. */
  practised: ReadonlySet<ChordToken>;
  /** The chord this loop was chosen for. `find` guarantees the window holds it. */
  target: ChordToken;
};

/**
 * Which boxes of the round wait for an answer, in beat order. Every other box
 * is given.
 *
 * - `one`: the target's last box;
 * - `half`: every practised box starting at or after the window's midpoint;
 * - `all`: every practised box.
 *
 * **Never empty.** A rule that selects nothing — the second half of a loop
 * whose practised chords all sit in its first half — falls back to the last
 * practised box. A round with no practised box at all throws: the loop query
 * only returns loops holding the target, so one would mean the round was built
 * for a different selection.
 */
export function askedPositions(
  boxes: readonly AskedBox[],
  opts: AskedOptions,
): number[] {
  if (!(Number.isFinite(opts.windowBeats) && opts.windowBeats > 0)) {
    throw new Error(
      `askedPositions: a window lasts a positive number of beats, got ${opts.windowBeats}`,
    );
  }
  if (!opts.practised.has(opts.target)) {
    throw new Error(
      `askedPositions: the target ${opts.target} is not a practised chord`,
    );
  }
  const practised = boxes.filter((box) => opts.practised.has(box.token));
  const last = practised.at(-1);
  if (last === undefined) {
    throw new Error(
      "askedPositions: the round holds no practised chord, so nothing can be asked",
    );
  }

  let selected: AskedBox[];
  switch (opts.blanks) {
    case "one": {
      const ofTarget = practised.filter((box) => box.token === opts.target);
      const lastOfTarget = ofTarget.at(-1);
      selected = lastOfTarget === undefined ? [] : [lastOfTarget];
      break;
    }
    case "half":
      selected = practised.filter(
        (box) => box.gridStart >= opts.windowBeats / 2,
      );
      break;
    case "all":
      selected = practised;
      break;
  }

  const asked = selected.length === 0 ? [last] : selected;
  return asked.map((box) => box.position).sort((a, b) => a - b);
}
