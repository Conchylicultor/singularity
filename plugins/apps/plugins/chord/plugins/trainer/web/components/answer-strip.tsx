import { MdCheck, MdClose } from "react-icons/md";
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
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
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
 * showing the answer given struck through beside it — and a click replays the
 * song over that box, given boxes included: they are part of the loop.
 */
export function AnswerStrip({
  round,
  sheet,
  fills,
  player,
  canReplay,
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
  /** A box can be replayed now: the player is ready, or the piano is playing them. */
  canReplay: boolean;
  /** The box sounding now, once checked (null otherwise). */
  soundingPosition: number | null;
  /** Names a chord in the song's key. */
  nameChord: (token: ChordToken) => string;
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
                canReplay={canReplay}
                nameChord={nameChord}
                onSelect={onSelect}
                onReplay={onReplayBox}
                onHearAnswer={onHearAnswer}
              />
            ))}
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
  onHearAnswer,
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
  /** Names a chord in the song's key. */
  nameChord: (token: ChordToken) => string;
  onSelect: (position: number) => void;
  onReplay: (box: Box) => void;
  onHearAnswer: (answer: ChordToken) => void;
}) {
  // Before the check a box shows the answer given; after it, the chord that
  // played, with a mark saying whether the answer was right. A given box shows
  // its own chord throughout and is never marked — nobody named it.
  const shown = checked ? box.token : answer;
  // The name follows `shown`, so it leaks nothing: before the check it names
  // what the LEARNER picked, after it the chord that really played.
  const name = shown === null ? null : nameChord(shown);
  const mark =
    checked && asked ? (answer === box.token ? "ok" : "bad") : undefined;
  // A wrong box keeps the answer given, struck through, beside the chord that
  // played — so the mistake and its correction read as one pair.
  const missed = mark === "bad" ? answer : null;
  const beatsLabel = `${String(box.gridSpan)} beat${box.gridSpan === 1 ? "" : "s"}`;
  // The box is a painted frame holding two buttons: the whole box replays its
  // stretch of the song (or selects it, before the check), and a wrong box's
  // struck answer plays the answer given. A button cannot hold a button, so
  // the box's own button is the full-bleed layer BEHIND the content, and the
  // struck answer opts back into clicks above it.
  return (
    <div
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
    >
      <Overlay
        fill
        clickThrough
        className="size-full"
        behind={
          <button
            type="button"
            className="chord-box-hit size-full"
            // A given box is nothing to press before the check; after it, it
            // replays its stretch of the song like any other box.
            disabled={checked ? !canReplay : !asked}
            // The numeral first, then the name, then ", given": the order the
            // e2e script and `ASKED_BOX` read, so the name extends the label
            // instead of moving anything already in it.
            aria-label={`Chord ${String(box.position + 1)}, ${beatsLabel}${
              shown === null
                ? ""
                : `: ${chordLabel(shown).text}${name === null ? "" : `, ${name}`}`
            }${asked ? "" : ", given"}${
              mark === undefined ? "" : mark === "ok" ? ", right" : ", wrong"
            }`}
            aria-pressed={checked || !asked ? undefined : selected}
            onClick={() => (checked ? onReplay(box) : onSelect(box.position))}
          />
        }
      >
        <Stack gap="xs" align="center" justify="center" className="size-full">
          {missed === null ? (
            shown !== null && <ChordNumeral token={shown} />
          ) : (
            <Stack
              direction="row"
              gap="xs"
              align="baseline"
              justify="center"
              className="chord-box-pair"
            >
              <Overlay.Interactive>
                <button
                  type="button"
                  className="chord-missed"
                  title="Hear what you picked"
                  aria-label={`Hear your answer, ${chordLabel(missed).text}`}
                  onClick={() => onHearAnswer(missed)}
                >
                  <ChordNumeral token={missed} />
                </button>
              </Overlay.Interactive>
              {shown !== null && <ChordNumeral token={shown} />}
            </Stack>
          )}
          {name !== null && <span className="chord-box-name">{name}</span>}
        </Stack>
      </Overlay>
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
    </div>
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
