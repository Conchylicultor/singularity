import { useEffect, useMemo, useRef } from "react";
import {
  useCursorApi,
  useRhythmHands,
  useSetRhythmHands,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { bars, scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  defaultBassPattern,
  defaultChordPattern,
  effectiveOnsets,
  toggleOnset,
  type RhythmHands,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import {
  RhythmCircle,
  type RhythmCircleHandle,
  type RhythmCircleTrack,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/rhythm-circle/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { rhythmResource } from "../../shared/resources";
import { useSaveRhythm } from "../actions";
import { TrackConfig } from "./track-config";

// Distinct theme tokens for the two concentric rings (outer = chords, inner = bass).
const CHORD_COLOR = "var(--chart-1)";
const BASS_COLOR = "var(--chart-2)";

/**
 * The "Rhythm" `Sonata.Section` panel — a per-song rhythm circle. A left hand
 * (bass) and right hand (chords) each strike an onset necklace; the circle spins
 * one revolution per bar with the playhead, its beads clickable to toggle onsets
 * ("Custom"). The persisted groove feeds the shell's score pipeline (via the
 * rhythm observer), so `reVoiceChords` renders the chords with real groove.
 *
 * The live resource is the panel's display truth (it remembers both patterns even
 * while disabled); the shell store carries the optimistic live value for instant
 * playback. Hidden for MIDI-only songs: a song must carry at least one authored
 * chord annotation for a groove to mean anything — mirroring the other
 * chord-driven sections' `return null` gate — so it serves ANY chord source.
 */
export function RhythmControls() {
  const { score, currentSongId } = useSonata();
  const storeHands = useRhythmHands();
  const setHands = useSetRhythmHands();
  const saveRhythm = useSaveRhythm();
  const cursor = useCursorApi();
  const circleRef = useRef<RhythmCircleHandle>(null);

  const rows = useResource(rhythmResource);
  const persisted = useMemo(() => {
    if (rows.pending || !currentSongId) return null;
    return rows.data.find((r) => r.songId === currentSongId) ?? null;
  }, [rows, currentSongId]);

  const hasAuthoredChord = useMemo(
    () =>
      score.annotations.some(
        (a) => a.type === "chord" && a.source === "authored",
      ),
    [score.annotations],
  );

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

  if (!hasAuthoredChord) return null;

  // Enabled ⇔ the shell store holds hands. Patterns come from the store (live,
  // optimistic) when enabled, else the persisted row (remembered while disabled),
  // else a sane default for a never-configured song.
  const enabled = storeHands != null;
  const bass = storeHands?.bass ?? persisted?.bass ?? defaultBassPattern();
  const chord = storeHands?.chord ?? persisted?.chord ?? defaultChordPattern();

  // Optimistically drive playback (shell store) and persist. The observer
  // re-affirms the same value on the next push.
  const commit = (next: RhythmHands, on: boolean) => {
    setHands(on ? next : null);
    if (currentSongId) {
      saveRhythm(currentSongId, { enabled: on, bass: next.bass, chord: next.chord });
    }
  };

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
    <Card className="rounded-lg p-lg">
      <Stack gap="md">
        <Stack direction="row" gap="sm" justify="between" align="center">
          <SectionLabel>Rhythm</SectionLabel>
          <ToggleChip
            active={enabled}
            onClick={() => commit({ bass, chord }, !enabled)}
          >
            {enabled ? "On" : "Off"}
          </ToggleChip>
        </Stack>

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
    </Card>
  );
}
