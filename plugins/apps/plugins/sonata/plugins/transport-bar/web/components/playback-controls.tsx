import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useRef } from "react";
import {
  MdFastForward,
  MdFastRewind,
  MdPause,
  MdPlayArrow,
} from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  beatToSeconds,
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { TempoWheel } from "./tempo-wheel";

/**
 * The tempo in effect at `beat`, in BPM. Derived from the canonical
 * `beatToSeconds` (the same source of truth the audio scheduler uses) rather
 * than reading `tempoMap` directly — so it's correct even for sources that
 * author no tempo (the 120-BPM playback default) and at exactly 100% speed,
 * where `scaleTempo` leaves the map untouched. The context's `score` already
 * has the playback `tempoScale` folded in, so this is the *live* BPM: it halves
 * at 50% and tracks any tempo changes within the song.
 */
function bpmAtBeat(score: Score, beat: number): number {
  const EPS = 0.001;
  const secondsPerBeat =
    (beatToSeconds(score, beat + EPS) - beatToSeconds(score, beat)) / EPS;
  return 60 / secondsPerBeat;
}

/**
 * Held longer than this, a press escalates from a single bar jump into the
 * bar-by-bar repeat. Short enough that a deliberate hold catches quickly; long
 * enough that an ordinary click stays a single one-measure jump.
 */
const HOLD_TO_REPEAT_MS = 220;

/**
 * A rewind / forward button: **press** jumps one measure (the previous/next bar
 * line), **press-and-hold** then repeats bar-by-bar at an accelerating cadence
 * until release. Both drive the shared transport, so the button and the ←/→ keys
 * behave identically. Pointer-driven (acts on press, not click) so the jump is
 * immediate and the hold gesture is first-class.
 */
function SeekButton({
  direction,
  icon: Icon,
  label,
  shortcut,
  disabled,
}: {
  direction: -1 | 1;
  icon: typeof MdFastRewind;
  label: string;
  shortcut: string;
  disabled: boolean;
}) {
  const { seekBar, startScrub, endScrub } = useSonata();
  // Pending hold timer + whether this press has escalated to the held repeat.
  const holdTimer = useRef<number | null>(null);
  const scrubbing = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // primary button / touch only
    e.preventDefault();
    // Capture so the release (and any drift outside the button) still lands here.
    e.currentTarget.setPointerCapture(e.pointerId);
    // Jump one measure right away; if the press is held, escalate to the repeat.
    seekBar(direction);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      scrubbing.current = true;
      startScrub(direction);
    }, HOLD_TO_REPEAT_MS);
  };

  const onPointerUp = () => {
    clearHoldTimer();
    if (scrubbing.current) {
      scrubbing.current = false;
      endScrub();
    }
  };

  // Capture lost (e.g. the press is interrupted): cancel a pending repeat and end
  // one already running.
  const onLostCapture = () => {
    clearHoldTimer();
    if (scrubbing.current) {
      scrubbing.current = false;
      endScrub();
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut === "ArrowLeft" ? "←" : "→"})`}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onLostCapture}
      className="size-7 touch-none rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Center className="size-full">
        <Icon className="size-4" />
      </Center>
    </button>
  );
}

/**
 * Sonata toolbar transport: a play/pause button and a jog-wheel speed control
 * (`[wheel | xx%]`, matching the piano-roll zoom wheel) with the live BPM beside
 * it. All drive the shared transport (`useSonata`) — the single owner of play
 * state and tempo — so they stay in lock-step with the keyboard controls
 * (Space, ↑/↓).
 */
export function PlaybackControls() {
  const { isPlaying, countIn, togglePlay, tempoScale, score } = useSonata();
  // A pending count-in reads as "playing" on the button: it shows Pause and a
  // click cancels the lead-in (togglePlay stops it).
  const active = isPlaying || countIn !== null;

  // Nothing to play until a source has loaded a Score with span; 0% is a frozen
  // transport, so play is unavailable there too.
  const hasScore = scoreEndBeat(score) > 0;
  const canPlay = hasScore && tempoScale > 0;
  // `score` is scaled by the tempo-math floor, not a literal 0, so read the live
  // BPM from it — but at a frozen 0% the true tempo is 0, not the floor.
  // `useCursorSelector` re-renders only when the rounded BPM changes (constant
  // for most songs), not on every cursor frame.
  const bpm = useCursorSelector(
    (cursorBeat) => {
      if (!hasScore) return null;
      if (tempoScale === 0) return 0;
      return bpmAtBeat(score, cursorBeat);
    },
    [hasScore, tempoScale, score],
  );

  return (
    <Stack direction="row" gap="sm" align="center">
      <SeekButton
        direction={-1}
        icon={MdFastRewind}
        label="Seek back"
        shortcut="ArrowLeft"
        disabled={!hasScore}
      />
      <IconButton
        icon={active ? MdPause : MdPlayArrow}
        label={active ? "Pause" : "Play"}
        shortcut="space"
        disabled={!active && !canPlay}
        onClick={togglePlay}
      />
      <SeekButton
        direction={1}
        icon={MdFastForward}
        label="Seek forward"
        shortcut="ArrowRight"
        disabled={!hasScore}
      />

      {/* Speed jog wheel: [wheel | xx%]. ↑/↓ keyboard shortcuts nudge the same value. */}
      <TempoWheel />

      {/* Live playback BPM (reflects the current speed). */}
      <Text
        as="span"
        variant="caption"
        className={cn(
          "tabular-nums text-muted-foreground",
          bpm == null && "opacity-40",
        )}
      >
        {bpm == null ? "— bpm" : `${Math.round(bpm)} bpm`}
      </Text>
    </Stack>
  );
}
