import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  bpmAtBeat,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";

/**
 * The metronome panel's top band: the live tempo the click follows, large, and
 * the playback speed it is derived from ("follows speed · 50%"). The session's
 * score already has the speed folded in, so `bpmAtBeat` on it IS the live BPM —
 * it halves at 50% and tracks tempo changes within the song.
 *
 * `useCursorSelector` re-renders only when the rounded BPM changes (constant for
 * most songs), never per cursor frame. At a frozen 0% the session's score is
 * scaled by the tempo-math floor, not by 0, so the true tempo is read as 0.
 */
export function TempoBand() {
  const { score, tempoScale } = useSession();
  const hasScore = scoreEndBeat(score) > 0;
  const bpm = useCursorSelector(
    (cursorBeat) => {
      if (!hasScore) return null;
      if (tempoScale === 0) return 0;
      return Math.round(bpmAtBeat(score, cursorBeat));
    },
    [hasScore, tempoScale, score],
  );

  return (
    <ControlPanel.Section>
      <Stack gap="2xs">
        <Stack direction="row" gap="xs" align="baseline">
          <Text variant="title" className="tabular-nums">
            {bpm ?? "—"}
          </Text>
          <Text variant="caption" tone="muted">
            bpm
          </Text>
        </Stack>
        <Text variant="caption" tone="muted" className="tabular-nums">
          follows speed · {Math.round(tempoScale * 100)}%
        </Text>
      </Stack>
    </ControlPanel.Section>
  );
}
