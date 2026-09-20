import { MdCheck, MdClose, MdVolumeUp } from "react-icons/md";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  useYouTubePlayhead,
  type YouTubePlayerController,
} from "@plugins/integrations/plugins/youtube/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  pct,
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import {
  gridBeatAt,
  sheetScore,
  type AnswerSheet,
  type Box,
  type Round,
} from "../../core";

/** Half the gap between two boxes, in px: each box gives it up on both sides. */
const HALF_GAP = 3;

/** A box's left edge on the strip: its first beat, minus nothing, plus half the gap. */
function beatX(beat: number, beats: number, pxOffset = HALF_GAP): string {
  return `calc(${pct(beat / beats)} + ${String(pxOffset)}px)`;
}

/**
 * The answer strip: one box per chord, as wide as the chord lasts, on a grid
 * of the window's beats, with a ruler of beat and bar ticks under it and a
 * playhead crossing the box that is sounding.
 *
 * Some boxes are **given**: the round is not asking about them, so they show
 * their chord from the start, dimmed and flat, and are not click targets until
 * the check. The heading counts only the boxes the learner has to name.
 *
 * Before the check, a click selects an asked box. After it, every box shows the
 * chord that played — the asked ones marked right or wrong, a wrong one
 * carrying a "you: X" tag (the answer given) — and a click replays the song
 * over that box, given boxes included: they are part of the loop.
 */
export function AnswerStrip({
  round,
  sheet,
  fills,
  player,
  playerReady,
  soundingPosition,
  nameChord,
  onSelect,
  onReplayBox,
  onHearAnswer,
}: {
  round: Round;
  sheet: AnswerSheet;
  /** How many times each box was filled: a new count replays the fill's pop. */
  fills: readonly number[];
  player: YouTubePlayerController;
  playerReady: boolean;
  /** The box sounding now, once checked (null otherwise). */
  soundingPosition: number | null;
  /** Names a chord in the song's key, or null while reveal is off. */
  nameChord: ((token: ChordToken) => string) | null;
  onSelect: (position: number) => void;
  onReplayBox: (box: Box) => void;
  onHearAnswer: (answer: ChordToken) => void;
}) {
  const { beats, beatsPerBar } = round.grid;
  // The heading counts the boxes the learner must name, never the given ones:
  // "Chord 1 of 2" on a four-chord loop where two are given.
  const askedPositions = round.boxes
    .filter((box) => sheet.asked[box.position] === true)
    .map((box) => box.position);
  const total = askedPositions.length;
  const asking =
    sheet.selected === null ? 0 : askedPositions.indexOf(sheet.selected);
  const score = sheet.checked ? sheetScore(sheet, round) : null;

  return (
    <Card className="rounded-2xl">
      <Stack gap="md">
        <Stack gap="2xs">
          <Text variant="caption" tone="faint" className="font-semibold">
            {score === null ? "Which chords?" : "Checked"}
          </Text>
          <Text as="h2" variant="heading" className="font-bold">
            {score === null ? (
              <>
                Chord {Math.max(asking, 0) + 1}{" "}
                <Text tone="faint" className="font-medium">
                  of {total}
                </Text>
              </>
            ) : (
              <>
                {score.right} of {score.total} right{" "}
                <Text tone="faint" className="font-medium">
                  in {(score.totalMs / 1000).toFixed(1)} s
                </Text>
              </>
            )}
          </Text>
        </Stack>
        <Stack gap="xs">
          <div className="chord-strip-boxes relative">
            {round.boxes.map((box) => (
              <AnswerBox
                key={`${String(box.position)}:${String(fills[box.position] ?? 0)}`}
                box={box}
                beats={beats}
                answer={sheet.answers[box.position] ?? null}
                asked={sheet.asked[box.position] === true}
                checked={sheet.checked}
                selected={sheet.selected === box.position}
                sounding={soundingPosition === box.position}
                popped={(fills[box.position] ?? 0) > 0}
                canReplay={playerReady}
                nameChord={nameChord}
                onSelect={onSelect}
                onReplay={onReplayBox}
              />
            ))}
            {sheet.checked &&
              round.boxes.map((box) => {
                if (sheet.asked[box.position] !== true) return null;
                const answer = sheet.answers[box.position] ?? null;
                return answer === null || answer === box.token ? null : (
                  <YourAnswer
                    key={box.position}
                    box={box}
                    beats={beats}
                    answer={answer}
                    onHear={onHearAnswer}
                  />
                );
              })}
            <PlayheadLine player={player} round={round} />
          </div>
          <div className="chord-ruler relative" aria-hidden="true">
            {Array.from({ length: Math.ceil(beats) }, (_, beat) => (
              <RulerTick
                key={beat}
                beat={beat}
                beats={beats}
                bar={beat % beatsPerBar === 0}
              />
            ))}
            <PlayheadTick player={player} round={round} />
          </div>
        </Stack>
      </Stack>
    </Card>
  );
}

function AnswerBox({
  box,
  beats,
  answer,
  asked,
  checked,
  selected,
  sounding,
  popped,
  canReplay,
  nameChord,
  onSelect,
  onReplay,
}: {
  box: Box;
  beats: number;
  answer: ChordToken | null;
  /** False on a GIVEN box: its chord was handed over, not asked for. */
  asked: boolean;
  checked: boolean;
  selected: boolean;
  sounding: boolean;
  popped: boolean;
  canReplay: boolean;
  /** Names a chord in the song's key, or null while reveal is off. */
  nameChord: ((token: ChordToken) => string) | null;
  onSelect: (position: number) => void;
  onReplay: (box: Box) => void;
}) {
  // Before the check a box shows the answer given; after it, the chord that
  // played, with a mark saying whether the answer was right. A given box shows
  // its own chord throughout and is never marked — nobody named it.
  const shown = checked ? box.token : answer;
  // The name follows `shown`, so it leaks nothing: before the check it names
  // what the LEARNER picked, after it the chord that really played.
  const name = shown === null || nameChord === null ? null : nameChord(shown);
  const mark =
    checked && asked ? (answer === box.token ? "ok" : "bad") : undefined;
  const beatsLabel = `${String(box.gridSpan)} beat${box.gridSpan === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      className={cn(placedClasses({}), "chord-box chord-tone")}
      style={{
        ...placedStyle(
          {
            start: beatX(box.gridStart, beats),
            size: `calc(${pct(box.gridSpan / beats)} - ${String(2 * HALF_GAP)}px)`,
          },
          "fill",
        ),
        ...(shown === null ? {} : chordToneStyle(shown)),
      }}
      data-given={asked ? undefined : ""}
      data-filled={asked && shown !== null ? "" : undefined}
      data-selected={selected ? "" : undefined}
      data-mark={mark}
      data-now={checked && sounding ? "" : undefined}
      data-pop={popped && !checked ? "" : undefined}
      // A given box is nothing to press before the check; after it, it replays
      // its stretch of the song like any other box.
      disabled={checked ? !canReplay : !asked}
      // The numeral first, then the name, then ", given": the order the e2e
      // script and `ASKED_BOX` read, so the name extends the label instead of
      // moving anything already in it.
      aria-label={`Chord ${String(box.position + 1)}, ${beatsLabel}${
        shown === null
          ? ""
          : `: ${chordLabel(shown).text}${name === null ? "" : `, ${name}`}`
      }${asked ? "" : ", given"}${
        mark === undefined ? "" : mark === "ok" ? ", right" : ", wrong"
      }`}
      aria-pressed={checked || !asked ? undefined : selected}
      onClick={() => (checked ? onReplay(box) : onSelect(box.position))}
    >
      <Stack
        as="span"
        gap="xs"
        align="center"
        justify="center"
        className="size-full"
      >
        {shown !== null && <ChordNumeral token={shown} />}
        {name !== null && <span className="chord-box-name">{name}</span>}
      </Stack>
      {mark !== undefined && (
        <Center
          as="span"
          aria-hidden="true"
          className={cn(placedClasses({}), "chord-badge")}
          style={placedStyle({ end: -9 }, { start: -9 })}
          data-mark={mark}
        >
          {mark === "ok" ? <MdCheck /> : <MdClose />}
        </Center>
      )}
    </button>
  );
}

/** "you: IV" under a wrong box, straddling its bottom edge: plays the answer given. */
function YourAnswer({
  box,
  beats,
  answer,
  onHear,
}: {
  box: Box;
  beats: number;
  answer: ChordToken;
  onHear: (answer: ChordToken) => void;
}) {
  const label = chordLabel(answer).text;
  return (
    <button
      type="button"
      className={cn(placedClasses({ layer: "raised" }), "chord-yours")}
      style={placedStyle(
        { center: beatX(box.gridStart + box.gridSpan / 2, beats, 0) },
        { end: 0, shift: "50%" },
      )}
      title="Hear what you picked"
      aria-label={`Hear your answer, ${label}`}
      onClick={() => onHear(answer)}
    >
      <Inline gap="2xs">
        <MdVolumeUp aria-hidden="true" />
        you: <s>{label}</s>
      </Inline>
    </button>
  );
}

function RulerTick({
  beat,
  beats,
  bar,
  on = false,
}: {
  beat: number;
  beats: number;
  bar: boolean;
  on?: boolean;
}) {
  return (
    <span
      className={cn(placedClasses({ decorative: true }), "chord-tick")}
      style={placedStyle({ start: beatX(beat, beats) }, { start: 4 })}
      data-bar={bar ? "" : undefined}
      data-on={on ? "" : undefined}
    />
  );
}

/**
 * The playhead: a line over the box that is sounding, at the beat the song is
 * on. Re-renders once per animation frame while the video plays, so it is its
 * own small component.
 */
function PlayheadLine({
  player,
  round,
}: {
  player: YouTubePlayerController;
  round: Round;
}) {
  const t = useYouTubePlayhead(player, true);
  const beat = t === null ? null : gridBeatAt(round.boxes, t);
  if (beat === null) return null;
  const box = round.boxes.find(
    (b) => beat >= b.gridStart && beat < b.gridStart + b.gridSpan,
  );
  const fraction =
    box === undefined ? 0 : (beat - box.gridStart) / box.gridSpan;
  return (
    <span
      className={cn(
        placedClasses({ decorative: true, layer: "raised" }),
        "chord-playhead",
      )}
      style={placedStyle(
        {
          start: beatX(
            beat,
            round.grid.beats,
            HALF_GAP - 2 * HALF_GAP * fraction,
          ),
        },
        { start: 10, end: 10 },
      )}
    />
  );
}

/** The ruler tick of the beat the song is on, lit. */
function PlayheadTick({
  player,
  round,
}: {
  player: YouTubePlayerController;
  round: Round;
}) {
  const t = useYouTubePlayhead(player, true);
  const beat = t === null ? null : gridBeatAt(round.boxes, t);
  if (beat === null) return null;
  const whole = Math.floor(beat);
  return (
    <RulerTick
      beat={whole}
      beats={round.grid.beats}
      bar={whole % round.grid.beatsPerBar === 0}
      on
    />
  );
}
