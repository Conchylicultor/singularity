import {
  beatTimesAlignment,
  beatToSeconds,
  chordOverlapsWindow,
  resolveVideoFraction,
  type BeatTimesAlignment,
  type ChordToken,
  type LoopCandidate,
  type LoopShapeId,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { hookpadTonicPc } from "@plugins/integrations/plugins/hooktheory/core";

// ── A round: the loop to play and the boxes to fill ──────────────────────────
//
// Beats are Hookpad's (1-based, from the section start); a window is
// `[startBeat, endBeat)`.

/** One answer box: one sounding chord of the window, as much of it as the window holds. */
export type Box = {
  /** 0-based, in beat order. */
  position: number;
  /** The chord that sounds: the right answer. */
  token: ChordToken;
  /** Where it sounds inside the window, clipped to it. */
  startBeat: number;
  endBeat: number;
  /** Beats from the window's start to the box's start: where the box sits on the grid. */
  gridStart: number;
  /** Beats the box lasts: how wide it is on the grid. */
  gridSpan: number;
  /** The same span in seconds into the video. */
  startSec: number;
  endSec: number;
};

export type Round = {
  sectionId: LoopCandidate["sectionId"];
  videoId: string;
  shape: LoopShapeId;
  /** The window's first beat, which with `sectionId` and `shape` names the loop. */
  startBeat: number;
  /** Pitch class (0–11) of the window's key: what the piano transposes the tokens by. */
  keyTonicPc: number;
  grid: {
    /** The window's length in beats. */
    beats: number;
    beatsPerBar: number;
  };
  /** The loop, `[window start, window end)`, in seconds into the video. */
  loop: { startSec: number; endSec: number };
  /** One per sounding chord, in beat order. A rest is a gap between boxes. */
  boxes: Box[];
};

export type RoundResult =
  | { kind: "round"; round: Round }
  /** A video-fraction alignment, and no video length yet: ask again once the player knows it. */
  | { kind: "needs-duration" };

/**
 * The round for a loop candidate.
 *
 * - One box per sounding chord overlapping the window, in beat order — the
 *   index's own overlap rule, so the boxes are the chords the window counted.
 *   A chord ringing in from before the window starts at the window's start; one
 *   running past its end stops at the end.
 * - Repeated chords are NEVER merged: a I for two beats then a I again is two
 *   boxes, as transcribed (user decision).
 * - A rest makes no box: it is a gap in the grid.
 *
 * `videoDurationSeconds` is the player's measure of the video, once loaded; it
 * wins over the candidate's (from the dump), which it can only correct. Only a
 * video-fraction alignment reads either.
 *
 * Throws on an alignment of `none` — `find` never returns one (such a section
 * has no windows) — and when the boxes disagree with the window's own chord
 * count, which would mean the server and this read the window differently.
 */
export function roundFromCandidate(
  candidate: LoopCandidate,
  opts: { videoDurationSeconds: number | null },
): RoundResult {
  const alignment = readableAlignment(candidate, opts.videoDurationSeconds);
  if (alignment === "needs-duration") return { kind: "needs-duration" };

  const { window } = candidate;
  const seconds = (beat: number) => beatToSeconds(alignment, beat);
  const sounding = candidate.chords
    .filter((chord) =>
      chordOverlapsWindow(chord, window.startBeat, window.endBeat),
    )
    .sort((a, b) => a.beat - b.beat);

  const boxes: Box[] = [];
  for (const chord of sounding) {
    if (chord.token === null) continue;
    const startBeat = Math.max(chord.beat, window.startBeat);
    const endBeat = Math.min(chord.beat + chord.duration, window.endBeat);
    boxes.push({
      position: boxes.length,
      token: chord.token,
      startBeat,
      endBeat,
      gridStart: startBeat - window.startBeat,
      gridSpan: endBeat - startBeat,
      startSec: seconds(startBeat),
      endSec: seconds(endBeat),
    });
  }
  if (boxes.length !== window.chordCount) {
    throw new Error(
      `Section ${candidate.sectionId} at beat ${window.startBeat}: ${boxes.length} sounding chords in the window, but the index counted ${window.chordCount}`,
    );
  }

  return {
    kind: "round",
    round: {
      sectionId: candidate.sectionId,
      videoId: candidate.videoId,
      shape: window.shape,
      startBeat: window.startBeat,
      keyTonicPc: hookpadTonicPc(window.keyTonic),
      grid: {
        beats: window.endBeat - window.startBeat,
        beatsPerBar: window.beatsPerBar,
      },
      loop: {
        startSec: seconds(window.startBeat),
        endSec: seconds(window.endBeat),
      },
      boxes,
    },
  };
}

function readableAlignment(
  candidate: LoopCandidate,
  playerDurationSeconds: number | null,
): BeatTimesAlignment | "needs-duration" {
  const { alignment } = candidate;
  switch (alignment.kind) {
    case "beat-times":
      // The wire schema checks only the shape; this checks the reading rules.
      return beatTimesAlignment(alignment.beats, alignment.times);
    case "video-fraction": {
      const duration = playerDurationSeconds ?? candidate.videoDurationSeconds;
      if (duration === null) return "needs-duration";
      if (!(Number.isFinite(duration) && duration > 0)) {
        throw new Error(
          `Video ${candidate.videoId} has a length of ${duration} s: a video-fraction alignment cannot be read against it`,
        );
      }
      return resolveVideoFraction(alignment, duration);
    }
    case "none":
      throw new Error(
        `Section ${candidate.sectionId} has no alignment, yet was offered as a loop: find never returns such a section`,
      );
  }
}
