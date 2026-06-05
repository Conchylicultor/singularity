import { useMemo } from "react";
import { MdAdd, MdPause, MdPlayArrow, MdRemove } from "react-icons/md";
import { cn } from "@/lib/utils";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  beatToSeconds,
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * One stepper press, as an authored-tempo fraction (5% = 0.05). Matches the
 * transport's 0.05 rounding grid so repeated taps land on tidy percentages.
 */
const SPEED_STEP = 0.05;
const MIN_SCALE = 0;
const MAX_SCALE = 4;

const asPercent = (scale: number) => `${Math.round(scale * 100)}%`;

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

/** A square ghost stepper button (− / +) for the speed control. */
function StepButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof MdAdd;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/**
 * Sonata toolbar transport: a play/pause button and a Synthesia-style speed
 * stepper (`[− xx% +]`) with the live BPM beside it. All drive the shared
 * transport (`useSonata`) — the single owner of play state and tempo — so they
 * stay in lock-step with the keyboard controls (Space, ↑/↓).
 */
export function PlaybackControls() {
  const { isPlaying, play, stop, tempoScale, setTempoScale, score, cursorBeat } =
    useSonata();

  // Nothing to play until a source has loaded a Score with span; 0% is a frozen
  // transport, so play is unavailable there too.
  const hasScore = scoreEndBeat(score) > 0;
  const canPlay = hasScore && tempoScale > 0;
  // `score` is scaled by the tempo-math floor, not a literal 0, so read the live
  // BPM from it — but at a frozen 0% the true tempo is 0, not the floor.
  const bpm = useMemo(() => {
    if (!hasScore) return null;
    if (tempoScale === 0) return 0;
    return bpmAtBeat(score, cursorBeat);
  }, [hasScore, tempoScale, score, cursorBeat]);

  return (
    <div className="flex items-center gap-2">
      <IconButton
        icon={isPlaying ? MdPause : MdPlayArrow}
        label={isPlaying ? "Pause" : "Play"}
        shortcut="space"
        disabled={!isPlaying && !canPlay}
        onClick={isPlaying ? stop : play}
      />

      {/* Speed stepper: [− xx% +]. ↑/↓ keyboard shortcuts nudge the same value. */}
      <div className="flex items-center rounded-md border border-border">
        <StepButton
          icon={MdRemove}
          label="Slow down"
          disabled={tempoScale <= MIN_SCALE}
          onClick={() => setTempoScale(tempoScale - SPEED_STEP)}
        />
        <span className="min-w-[3rem] border-x border-border px-1 text-center text-xs font-medium tabular-nums">
          {asPercent(tempoScale)}
        </span>
        <StepButton
          icon={MdAdd}
          label="Speed up"
          disabled={tempoScale >= MAX_SCALE}
          onClick={() => setTempoScale(tempoScale + SPEED_STEP)}
        />
      </div>

      {/* Live playback BPM (reflects the current speed). */}
      <span
        className={cn(
          "tabular-nums text-xs text-muted-foreground",
          bpm == null && "opacity-40",
        )}
      >
        {bpm == null ? "— bpm" : `${Math.round(bpm)} bpm`}
      </span>
    </div>
  );
}
