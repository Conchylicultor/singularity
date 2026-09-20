import { MdLock } from "react-icons/md";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { NextStep } from "../../core";
import type { StepReadiness } from "../internal/readiness";
import "./next-step.css";

/**
 * The locked next chord, at the end of the chord buttons: its numeral greyed,
 * a padlock, and the level it would reach. Once every chord the learner has is
 * mastered it brightens and reads **Add it**.
 *
 * Pressing it always works — before everything is mastered the learner is
 * adding early, not doing something forbidden — so the pad is a button in both
 * states. Its accessible name stays **Next step** whichever state it is in.
 *
 * While the readiness is **unknown** (the standing has not landed) the pad
 * waits: no padlock, nothing to press. It says only the level, which is true
 * whatever the standing turns out to be.
 *
 * **Chords only.** A step that opens a key mode, or more of the loop to name,
 * has no numeral to show, so it has no pad; it shows in the panel's
 * `<NextStepRow>` instead, which draws every kind of step.
 */
export function NextStepPad({
  step,
  level,
  readiness,
  adding = false,
  onAdd,
}: {
  /** The step on offer. A pad is drawn only for one that opens chords. */
  step: NextStep;
  /** The level this step would reach: what the pad reads at rest. */
  level: number;
  /** Whether the learner is ready — or that it is not known yet. */
  readiness: StepReadiness;
  /** A write is out: the pad waits rather than taking a second press. */
  adding?: boolean;
  onAdd: () => void;
}) {
  if (step.kind !== "chords") return null;
  const token = step.tokens[0];
  if (token === undefined) return null;
  const more = step.tokens.length - 1;
  const ready = readiness === "ready";
  return (
    <button
      type="button"
      className="chord-next-pad chord-tone relative"
      style={chordToneStyle(token)}
      data-ready={ready ? "" : undefined}
      data-waiting={readiness === "unknown" ? "" : undefined}
      disabled={adding || readiness === "unknown"}
      aria-label="Next step"
      onClick={onAdd}
    >
      <Stack as="span" gap="none" justify="between" className="h-full">
        <Line as="span" className="gap-xs">
          <ChordNumeral token={token} />
          {more > 0 && <span className="chord-next-sub">+{more}</span>}
          <Fill as="span" />
          {readiness === "early" && <MdLock aria-hidden="true" />}
        </Line>
        <span className="chord-next-sub">
          {ready ? "Add it" : `Level ${String(level)}`}
        </span>
      </Stack>
    </button>
  );
}
