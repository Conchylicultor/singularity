import { MdLock } from "react-icons/md";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { NextStep } from "../../core";
import type { StepReadiness } from "../internal/readiness";
import { stepWording } from "../internal/step-wording";
import "./next-step.css";

/**
 * The next step at the foot of "Your chords": what it is, the level it would
 * reach, and the button that takes it.
 *
 * **Every kind of step shows here**, which is why the panel has this row and
 * not only the chord grid's pad. A chord step shows its numeral, a key-mode
 * step the mode's name, and an ask-rule step reads "Name the cadence" or "Name
 * the whole loop".
 *
 * The button is always live. Once every unlocked chord is mastered it reads
 * **Add** and is the prominent one; before that it reads **Add anyway** — the
 * learner may go faster than the trainer suggests. Its accessible name is
 * **Add** in both states, so it is one control however it reads.
 *
 * While the readiness is **unknown** the button shows its waiting form instead
 * of either label: "Add anyway" during the load would be telling this learner
 * they are behind, and then taking it back.
 */
export function NextStepRow({
  step,
  level,
  readiness,
  adding = false,
  onAdd,
}: {
  step: NextStep;
  /** The level this step would reach. */
  level: number;
  /** Whether the learner is ready — or that it is not known yet. */
  readiness: StepReadiness;
  /** A write is out: the button waits rather than taking a second press. */
  adding?: boolean;
  onAdd: () => void;
}) {
  const { headline, detail, tokens } = stepWording(step);
  const token = tokens[0] ?? null;
  const ready = readiness === "ready";
  return (
    <Line
      className="chord-next-row chord-tone gap-xs border-b border-border py-xs last:border-b-0"
      style={token === null ? undefined : chordToneStyle(token)}
      data-ready={ready ? "" : undefined}
      title={detail}
    >
      <Center className={cn(rigidClass(), "chord-next-chip")}>
        {token === null ? (
          <MdLock aria-hidden="true" />
        ) : (
          <ChordNumeral token={token} />
        )}
      </Center>
      <Fill>
        <Stack gap="none">
          <Text variant="caption" className="font-semibold">
            {headline}
          </Text>
          <Text variant="caption" tone="faint">
            {ready ? "Ready to add" : `Level ${String(level)}`}
          </Text>
        </Stack>
      </Fill>
      <ControlSizeProvider size="sm">
        <Button
          variant={ready ? "default" : "outline"}
          aria-label="Add"
          loading={adding || readiness === "unknown"}
          className={rigidClass()}
          onClick={onAdd}
        >
          {readiness === "early" ? "Add anyway" : "Add"}
        </Button>
      </ControlSizeProvider>
    </Line>
  );
}
