import { useEffect, useMemo, useRef } from "react";
import {
  useCursorApi,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { bars, scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
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
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useGroove } from "../use-groove";
import { TrackConfig } from "./track-config";

// Distinct theme tokens for the two concentric rings (outer = chords, inner = bass).
const CHORD_COLOR = "var(--chart-1)";
const BASS_COLOR = "var(--chart-2)";

/**
 * The "Rhythm" section — the BODY of a `Sonata.Section` card whose chrome (Card +
 * collapsible "Rhythm" title) the host paints. A per-song rhythm circle: a left
 * hand (bass) and right hand (chords) each strike an onset necklace; the circle
 * spins one revolution per bar with the playhead, its beads clickable to toggle
 * onsets ("Custom"). The persisted groove feeds the shell's score pipeline (via
 * the rhythm observer), so `reVoiceChords` renders the chords with real groove.
 *
 * Resolved groove + the optimistic commit come from the shared `useGroove()`
 * hook, which the header On/Off toggle (`RhythmActions`) also reads — so the
 * collapsed card's toggle and the open card's circle drive one groove.
 *
 * Hidden for MIDI-only songs: a song must carry at least one authored chord
 * annotation for a groove to mean anything. That applicability gate is the
 * contribution's `useAvailable` (`useHasAuthoredChord`) — the card is not painted
 * at all otherwise — so this body never needs a `return null`. It serves ANY
 * chord source (chord-grid, ultimate-guitar), not just the chord grid.
 */
export function RhythmControls() {
  const { score } = useSonata();
  const { enabled, bass, chord, commit } = useGroove();
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
      if (!handle) return; // circle not mounted (groove disabled)
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
        idx + 1 < barList.length ? (barList[idx + 1]?.startBeat ?? endBeat) : endBeat;
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
      colorVar: CHORD_COLOR,
      label: "Right hand (chords)",
    },
    {
      id: "bass",
      subdivisions: bass.subdivisions,
      onsets: effectiveOnsets(bass),
      colorVar: BASS_COLOR,
      label: "Left hand (bass)",
    },
  ];

  const onToggleOnset = (trackId: string, index: number) => {
    if (trackId === "bass") {
      commit({ bass: toggleOnset(bass, index), chord }, true);
    } else {
      commit({ bass, chord: toggleOnset(chord, index) }, true);
    }
  };

  return (
    <Stack gap="md">
      {enabled ? (
        <>
          <Center>
            <RhythmCircle
              ref={circleRef}
              tracks={tracks}
              onToggleOnset={onToggleOnset}
              size={220}
            />
          </Center>
          <TrackConfig
            label="Left hand (bass)"
            pattern={bass}
            onChange={(next) => commit({ bass: next, chord }, true)}
          />
          <TrackConfig
            label="Right hand (chords)"
            pattern={chord}
            onChange={(next) => commit({ bass, chord: next }, true)}
          />
        </>
      ) : (
        <Text as="div" variant="caption" tone="muted">
          Turn on to play the chords with a left/right-hand groove.
        </Text>
      )}
    </Stack>
  );
}
