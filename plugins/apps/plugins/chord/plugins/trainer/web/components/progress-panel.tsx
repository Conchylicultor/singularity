import { MdCheck } from "react-icons/md";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  TARGET_ACCURACY,
  TARGET_MEDIAN_MS,
  type ChordProgress,
  type ChordStanding,
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  matchResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  pct,
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { chordToneStyle } from "../internal/chord-tone";
import { ChordNumeral } from "./chord-numeral";

/**
 * The side panel: today's totals, a quieter all-time line, and "Your chords" —
 * one line per unlocked chord with how well it is known.
 *
 * "Your chords" is a plain component, not a DataView: it is a small fixed
 * status list (the unlocked set, a few dozen chords at most, in the
 * curriculum's order), not a collection anyone searches, sorts or filters.
 */
export function ProgressPanel({
  progress,
  chords,
}: {
  progress: ResourceResult<ChordProgress>;
  /** The unlocked chords, in the order to list them. */
  chords: readonly ChordToken[];
}) {
  return (
    <Card className="rounded-2xl" aria-label="Your progress">
      {matchResource(progress, {
        pending: () => <Loading variant="rows" count={4} />,
        ready: (p) => <PanelBody progress={p} chords={chords} />,
      })}
    </Card>
  );
}

function PanelBody({
  progress,
  chords,
}: {
  progress: ChordProgress;
  chords: readonly ChordToken[];
}) {
  const { today, allTime } = progress;
  const byToken = new Map(progress.chords.map((c) => [c.token, c] as const));
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text variant="caption" tone="faint" className="font-semibold">
          Today
        </Text>
        <Grid cols={3} gap="sm">
          <Stat value={String(today.songs)} label="songs" />
          <Stat value={percent(today.correct, today.answers)} label="right" />
          <Stat
            value={
              today.answers === 0
                ? "–"
                : `${(today.totalMs / today.answers / 1000).toFixed(1)} s`
            }
            label="per chord"
          />
        </Grid>
        <Text variant="caption" tone="faint">
          All time: {allTime.songs} {allTime.songs === 1 ? "song" : "songs"},{" "}
          {percent(allTime.correct, allTime.answers)} right
        </Text>
      </Stack>
      <Stack gap="xs" className="border-t border-border pt-lg">
        <Text variant="caption" tone="faint" className="font-semibold">
          Your chords
        </Text>
        <Stack gap="none">
          {chords.map((token) => (
            <ChordStandingLine
              key={token}
              token={token}
              standing={byToken.get(token) ?? null}
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap="none">
      <Text variant="title" className="font-bold tabular-nums">
        {value}
      </Text>
      <Text variant="caption" tone="faint">
        {label}
      </Text>
    </Stack>
  );
}

/** `correct / answers` as a whole percentage, or "–" with no answers. */
function percent(correct: number, answers: number): string {
  return answers === 0
    ? "–"
    : `${String(Math.round((correct / answers) * 100))}%`;
}

/**
 * One chord: its chip, an accuracy meter marked at 90 %, the accuracy, the
 * usual answer time (red when over 2 s), and a check once it is mastered.
 * `standing` is null for a chord the server did not list (never answered).
 */
function ChordStandingLine({
  token,
  standing,
}: {
  token: ChordToken;
  standing: ChordStanding | null;
}) {
  const answers = standing?.answers ?? 0;
  const accuracy = standing?.accuracy ?? null;
  const medianMs = standing?.medianMs ?? null;
  const mastered = standing?.mastered ?? false;
  const label = chordLabel(token).text;
  const title =
    accuracy === null || medianMs === null
      ? `${label}: not heard yet`
      : `${label}: ${String(Math.round(accuracy * 100))}% right over your last ${String(answers)}, usually in ${(medianMs / 1000).toFixed(1)} s`;
  return (
    <Line
      className="chord-tone gap-xs border-b border-border py-xs last:border-b-0"
      style={chordToneStyle(token)}
      title={title}
    >
      <Center className={cn(rigidClass(), "chord-chip w-11")}>
        <ChordNumeral token={token} />
      </Center>
      <Fill className="relative">
        <Clip className="chord-meter relative w-full">
          <span
            className={cn(
              placedClasses({ decorative: true }),
              "chord-meter-fill",
            )}
            style={placedStyle({ start: 0, size: pct(accuracy ?? 0) }, "fill")}
          />
        </Clip>
        <span
          className={cn(
            placedClasses({ decorative: true }),
            "chord-meter-target",
          )}
          style={placedStyle(
            { start: pct(TARGET_ACCURACY) },
            { start: -4, end: -4 },
          )}
        />
      </Fill>
      <Text
        variant="caption"
        className={cn(
          rigidClass(),
          "chord-figure w-10 text-right font-semibold",
        )}
      >
        {accuracy === null ? "–" : `${String(Math.round(accuracy * 100))}%`}
      </Text>
      <Text
        variant="caption"
        tone="faint"
        className={cn(rigidClass(), "chord-figure w-10 text-right")}
        data-slow={
          medianMs !== null && medianMs > TARGET_MEDIAN_MS ? "" : undefined
        }
      >
        {medianMs === null ? "–" : `${(medianMs / 1000).toFixed(1)} s`}
      </Text>
      <Center
        className={cn(rigidClass(), "chord-mastery")}
        data-mastered={mastered ? "" : undefined}
        aria-label={mastered ? "Mastered" : "Not mastered yet"}
      >
        {mastered && <MdCheck aria-hidden="true" />}
      </Center>
    </Line>
  );
}
