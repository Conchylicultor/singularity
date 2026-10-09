import { useEffect, useMemo, useRef } from "react";
import {
  useCursorApi,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import { useLibrarySong } from "@plugins/apps/plugins/sonata/plugins/document/web";
import {
  bars,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  effectiveOnsets,
  toggleOnset,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import {
  RhythmCircle,
  type RhythmCircleHandle,
  type RhythmCircleTrack,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/rhythm-circle/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { useGroove, type GrooveState } from "../use-groove";
import { GroovePresetPicker } from "./groove-preset-picker";
import { HAND_COLORS } from "./hand-colors";
import { HandRow } from "./hand-row";

/**
 * The groove body — composed under a section whose header holds
 * `GrooveSwitch`, top to bottom: the groove preset picker, the rhythm circle
 * (one revolution per bar with the playhead, its beads clickable to toggle
 * onsets) and one row per hand (pattern, rhythm, rotate/steps). The persisted
 * groove feeds the song document's score pipeline (via the rhythm observer),
 * so `reVoiceChords` renders the chords with real groove.
 *
 * Resolved groove + the optimistic commit come from the shared `useGroove()`
 * hook, which the header switch also reads — so the collapsed section's switch
 * and the open body drive one groove. While the groove is off the body renders
 * nothing (the switch is the whole control); while the song's groove is
 * loading it is a loading state — never the default patterns standing in for
 * the song's own. The composing section owns the applicability gate (whether
 * the song document voices this song's chords at all).
 */
export function RhythmControls() {
  const song = useLibrarySong();
  const groove = useGroove();
  // Only a library song's groove persists: a file document shows no editor.
  if (song.kind === "none") return null;
  switch (groove.status) {
    case "loading":
      return <Loading variant="rows" count={3} />;
    case "error":
      return (
        <ResourceErrorInline
          variant="block"
          subject="this song's rhythm"
          error={groove.error}
          refetch={groove.refetch}
        />
      );
    case "ready":
      return groove.data.enabled ? <GrooveEditor groove={groove.data} /> : null;
  }
}

/** The preset picker, circle and per-hand rows over a KNOWN, enabled groove. */
function GrooveEditor({ groove }: { groove: GrooveState }) {
  const { score } = useSession();
  const { presetId, bass, chord, bassFigurationId, chordFigurationId, commit } =
    groove;
  const cursor = useCursorApi();
  const circleRef = useRef<RhythmCircleHandle>(null);

  // Bar grid for the zero-render spin. `bars()` is time-signature aware (4/4
  // default); the last bar's span runs to `scoreEndBeat`.
  const barList = useMemo(() => bars(score), [score]);
  const endBeat = useMemo(() => scoreEndBeat(score), [score]);

  // Drive the needle imperatively from the transport cursor — ZERO React renders
  // per frame (the exact `return cursor.subscribe(paint)` idiom the scrubber
  // uses). One revolution per bar: phase = (beat − barStart) / barSpan.
  useEffect(() => {
    return cursor.subscribe(() => {
      const handle = circleRef.current;
      if (!handle) return; // circle not mounted yet
      const beat = cursor.getBeat();
      // Last bar whose start is <= beat.
      let lo = 0;
      let hi = barList.length - 1;
      let idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((barList[mid]?.startBeat ?? 0) <= beat) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const start = barList[idx]?.startBeat ?? 0;
      const nextStart =
        idx + 1 < barList.length
          ? (barList[idx + 1]?.startBeat ?? endBeat)
          : endBeat;
      const span = nextStart - start;
      if (span <= 0) return; // degenerate bar — leave the needle put
      const phase = Math.max(0, Math.min(1, (beat - start) / span));
      handle.setPhase(phase);
    });
  }, [cursor, barList, endBeat]);

  const tracks: RhythmCircleTrack[] = [
    {
      id: "chord",
      subdivisions: chord.subdivisions,
      onsets: effectiveOnsets(chord),
      colorVar: HAND_COLORS.chord.colorVar,
      label: "Right hand (chords)",
    },
    {
      id: "bass",
      subdivisions: bass.subdivisions,
      onsets: effectiveOnsets(bass),
      colorVar: HAND_COLORS.bass.colorVar,
      label: "Left hand (bass)",
    },
  ];

  // The full groove payload with one field overridden — every commit carries
  // both hands' patterns, figuration ids AND the preset provenance, so nothing
  // is dropped.
  const fields = { presetId, bass, chord, bassFigurationId, chordFigurationId };

  const onToggleOnset = (trackId: string, index: number) => {
    if (trackId === "bass") {
      commit({ ...fields, bass: toggleOnset(bass, index) }, true);
    } else {
      commit({ ...fields, chord: toggleOnset(chord, index) }, true);
    }
  };

  return (
    <Stack gap="md">
      <GroovePresetPicker groove={groove} />
      <Center>
        <RhythmCircle
          ref={circleRef}
          tracks={tracks}
          onToggleOnset={onToggleOnset}
          size={180}
        />
      </Center>
      <Stack gap="xs">
        <HandRow
          hand="chord"
          pattern={chord}
          onChange={(next) => commit({ ...fields, chord: next }, true)}
          figurationId={chordFigurationId}
          onFigurationChange={(id) =>
            commit({ ...fields, chordFigurationId: id }, true)
          }
        />
        <HandRow
          hand="bass"
          pattern={bass}
          onChange={(next) => commit({ ...fields, bass: next }, true)}
          figurationId={bassFigurationId}
          onFigurationChange={(id) =>
            commit({ ...fields, bassFigurationId: id }, true)
          }
        />
      </Stack>
    </Stack>
  );
}
