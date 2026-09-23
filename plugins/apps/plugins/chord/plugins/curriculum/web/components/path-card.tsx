import { useState } from "react";
import { MdAdd, MdCheck, MdHearing } from "react-icons/md";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordLabel } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  pct,
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  Stack,
  selfClass,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  BLANKS,
  BLANKS_LABEL,
  CHAPTERS,
  cellName,
  cellOf,
  cellStanding,
  chordState,
  nextCell,
  onRoute,
  pathOrder,
  routeOf,
  sameCell,
  type Blanks,
  type Cell,
  type Chapter,
  type ChordState,
  type PathRow,
  type Selection,
  type TokenStanding,
} from "../../core";
import {
  useCurriculumWrites,
  type CurriculumWrites,
} from "../internal/use-curriculum";
import "./path.css";

/** How the path reads a chord's standing at one blanks level (from `chord.progress`). */
export type StandingLookup = (
  token: ChordToken,
  blanks: Blanks,
) => TokenStanding;

const STATE_LABEL: Record<ChordState, string> = {
  practice: "Practise",
  hear: "Hear only",
  off: "Off",
};
const NEXT_STATE: Record<ChordState, ChordState> = {
  practice: "hear",
  hear: "off",
  off: "practice",
};
const BLANKS_HELP: Record<Blanks, string> = {
  one: "Name a single box",
  half: "Name the loop's second half, where the cadence is",
  all: "Name every box",
};

/**
 * The Path card: everything the learner can set, folded away until they want
 * it. Closed, one line says where they stand on the path, with a way back to
 * it. Open: the chords (each practised, heard or off), the blanks (one, half,
 * all), a sentence on where the path goes next, and every chapter's map.
 *
 * Nothing here gates anything: the path only suggests. Every control writes
 * the selection straight away, and the trainer follows it.
 */
export function PathCard({
  selection,
  standing,
}: {
  selection: Selection;
  standing: StandingLookup;
}) {
  const writes = useCurriculumWrites();
  const [open, setOpen] = useState(false);
  const here = cellOf(selection);
  const next = nextCell(standing);
  const onTrack = here !== null && next !== null && sameCell(here, next);
  const status = onTrack
    ? "On track"
    : here === null
      ? "Free practice"
      : onRoute(here)
        ? "On the path"
        : "Off the route";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-t border-border pt-lg"
    >
      <Stack gap="sm">
        <CollapsibleTrigger className="gap-xs" aria-label="Path">
          <Text variant="caption" tone="faint" className="font-semibold">
            Path
          </Text>
          <Fill>
            <Text variant="caption" tone="muted">
              {status}
            </Text>
          </Fill>
          <CollapsibleChevron className="text-faint-foreground" />
        </CollapsibleTrigger>
        {!open && next !== null && !onTrack && (
          <ControlSizeProvider size="sm">
            <Button
              variant="outline"
              className={selfClass("start")}
              loading={writes.pending}
              onClick={() => writes.applyCell(next)}
            >
              Resume: {cellName(next)}
            </Button>
          </ControlSizeProvider>
        )}
        <CollapsibleContent>
          <Stack gap="lg">
            <Stack gap="md" className="border-b border-border pb-lg">
              <ChordChips selection={selection} writes={writes} />
              <BlanksControl selection={selection} writes={writes} />
            </Stack>
            <Coach
              here={here}
              next={next}
              standing={standing}
              writes={writes}
            />
            <Chapters
              here={here}
              next={next}
              standing={standing}
              writes={writes}
            />
          </Stack>
        </CollapsibleContent>
      </Stack>
    </Collapsible>
  );
}

// ── Chords: each one practised, heard or off ────────────────────────────────

/**
 * The first chapter's chords, and every chord that is on, in path order. A
 * click moves one to its next state: practise → hear only → off. The + menu
 * sets a whole chapter at once, which is how chords past the first chapter
 * come in.
 */
function ChordChips({
  selection,
  writes,
}: {
  selection: Selection;
  writes: CurriculumWrites;
}) {
  const first = CHAPTERS[0]?.rows.flatMap((r) => r.tokens) ?? [];
  const tokens = [
    ...new Set([...first, ...selection.chords.map((c) => c.token)]),
  ].sort(pathOrder);
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="faint" className="font-semibold">
        Chords
      </Text>
      <Stack direction="row" gap="xs" wrap align="center" aria-label="Chords">
        {tokens.map((token) => {
          const state = chordState(selection, token);
          const label = chordLabel(token).text;
          return (
            <button
              key={token}
              type="button"
              className="chord-tone chord-state-chip"
              style={chordToneStyle(token)}
              data-state={state}
              title={`${label}: ${STATE_LABEL[state]} — click for ${STATE_LABEL[NEXT_STATE[state]].toLowerCase()}`}
              aria-label={`${label}, ${STATE_LABEL[state]}`}
              onClick={() => writes.setChordState(token, NEXT_STATE[state])}
            >
              <ChordNumeral token={token} />
              {state === "hear" && (
                <span className="chord-state-ear" aria-hidden="true">
                  <MdHearing />
                </span>
              )}
            </button>
          );
        })}
        <ChapterMenu selection={selection} writes={writes} />
      </Stack>
    </Stack>
  );
}

type ChapterStateValue = ChordState | "mixed";

/** A chapter's state as one value: every chord (or, for a mode chapter, every mode) alike, or mixed. */
function chapterState(
  selection: Selection,
  chapter: Chapter,
): ChapterStateValue {
  const tokens = chapter.rows.flatMap((r) => r.tokens);
  const states =
    tokens.length > 0
      ? tokens.map((token) => chordState(selection, token))
      : chapter.rows
          .flatMap((r) => r.modes)
          .map((mode): ChordState =>
            selection.modes.includes(mode) ? "practice" : "off",
          );
  const [firstState] = states;
  return firstState !== undefined && states.every((s) => s === firstState)
    ? firstState
    : "mixed";
}

function ChapterMenu({
  selection,
  writes,
}: {
  selection: Selection;
  writes: CurriculumWrites;
}) {
  return (
    <InlinePopover
      tooltip="More chords"
      align="end"
      width="md"
      trigger={
        <button
          type="button"
          className="chord-state-more"
          aria-label="More chords"
        >
          <MdAdd aria-hidden="true" />
        </button>
      }
    >
      <Stack gap="xs">
        <Text variant="caption" tone="faint" className="font-semibold">
          Whole chapters at once
        </Text>
        {CHAPTERS.slice(1).map((chapter) => (
          <Line
            key={chapter.id}
            className="gap-sm border-t border-border py-xs"
          >
            <Fill>
              <Stack gap="none">
                <Text variant="body" className="font-semibold">
                  {chapter.name}
                </Text>
                <Text variant="caption" tone="faint">
                  {chapter.rows.map((r) => r.name).join(", ")}
                </Text>
              </Stack>
            </Fill>
            <SegmentedControl<ChapterStateValue>
              className={rigidClass()}
              options={(["practice", "hear", "off"] as const).map((id) => ({
                id,
                label: id === "hear" ? "Hear" : STATE_LABEL[id],
              }))}
              value={chapterState(selection, chapter)}
              onChange={(state) => {
                if (state !== "mixed")
                  writes.setChapterState(chapter.id, state);
              }}
            />
          </Line>
        ))}
      </Stack>
    </InlinePopover>
  );
}

// ── Blanks: how much of the loop is named ───────────────────────────────────

/** A tiny loop of four boxes: hollow ones are the blanks, filled ones are given. */
const GLYPH: Record<Blanks, readonly boolean[]> = {
  one: [false, false, true, false],
  half: [false, false, true, true],
  all: [true, true, true, true],
};

export function BlanksGlyph({ blanks }: { blanks: Blanks }) {
  return (
    <span className="chord-blanks-glyph" aria-hidden="true">
      {GLYPH[blanks].map((blank, i) => (
        <i key={i} data-blank={blank ? "" : undefined} />
      ))}
    </span>
  );
}

function BlanksControl({
  selection,
  writes,
}: {
  selection: Selection;
  writes: CurriculumWrites;
}) {
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="faint" className="font-semibold">
        Blanks
      </Text>
      <SegmentedControl<Blanks>
        options={BLANKS.map((blanks) => ({
          id: blanks,
          label: BLANKS_LABEL[blanks],
          icon: <BlanksGlyph blanks={blanks} />,
          title: BLANKS_HELP[blanks],
        }))}
        value={selection.blanks}
        onChange={writes.setBlanks}
      />
    </Stack>
  );
}

// ── Where the path goes next ────────────────────────────────────────────────

function Coach({
  here,
  next,
  standing,
  writes,
}: {
  here: Cell | null;
  next: Cell | null;
  standing: StandingLookup;
  writes: CurriculumWrites;
}) {
  if (next === null) {
    return (
      <Text variant="body" tone="muted">
        Every step of the path is mastered.
      </Text>
    );
  }
  if (here !== null && sameCell(here, next)) {
    const s = cellStanding(next, standing);
    return (
      <Stack gap="xs" aria-label="Where you are">
        <Text variant="caption" tone="faint">
          You're on the path
        </Text>
        <Text variant="heading" className="font-bold">
          {cellName(next)}
        </Text>
        <MeterBar progress={s?.progress ?? 0} />
      </Stack>
    );
  }
  return (
    <Stack gap="xs" align="start" aria-label="Where you are">
      <Text variant="caption" tone="faint">
        {here === null ? "Free practice" : "Next on the path"}
      </Text>
      <Text variant="heading" className="font-bold">
        {cellName(next)}
      </Text>
      <ControlSizeProvider size="sm">
        <Button
          variant="outline"
          loading={writes.pending}
          onClick={() => writes.applyCell(next)}
        >
          {here === null ? "Back to the path" : "Go"}
        </Button>
      </ControlSizeProvider>
    </Stack>
  );
}

function MeterBar({ progress }: { progress: number }) {
  return (
    <Fill className="relative chord-path-meter">
      <span
        className={cn(
          placedClasses({ decorative: true }),
          "chord-path-meter-fill",
        )}
        style={placedStyle({ start: 0, size: pct(progress) }, "fill")}
      />
    </Fill>
  );
}

// ── The chapters, each opening to its map ───────────────────────────────────

function Chapters({
  here,
  next,
  standing,
  writes,
}: {
  here: Cell | null;
  next: Cell | null;
  standing: StandingLookup;
  writes: CurriculumWrites;
}) {
  const [openId, setOpenId] = useState<string | null>(
    () => here?.chapter ?? next?.chapter ?? CHAPTERS[0]?.id ?? null,
  );
  return (
    <Stack gap="none">
      {CHAPTERS.map((chapter, index) => {
        const route = routeOf(chapter);
        const done = route.filter(
          (cell) => cellStanding(cell, standing)?.mastered === true,
        ).length;
        const isOpen = openId === chapter.id;
        return (
          <Collapsible
            key={chapter.id}
            open={isOpen}
            onOpenChange={(o) => setOpenId(o ? chapter.id : null)}
            className="border-t border-border"
          >
            <CollapsibleTrigger className="gap-xs py-sm">
              <Center
                className={cn(rigidClass(), "chord-chapter-n")}
                data-open={isOpen ? "" : undefined}
              >
                {index + 1}
              </Center>
              <Fill>
                <Text variant="body" className="font-semibold">
                  {chapter.name}
                </Text>
              </Fill>
              <Text variant="caption" tone="faint" className={rigidClass()}>
                {done === 0 ? "not started" : `${done} of ${route.length}`}
              </Text>
              <CollapsibleChevron className="text-faint-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Stack gap="sm" className="pb-md">
                <Text variant="caption" tone="faint">
                  {chapter.blurb}
                </Text>
                <ChapterMap
                  chapter={chapter}
                  here={here}
                  next={next}
                  standing={standing}
                  writes={writes}
                />
              </Stack>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </Stack>
  );
}

/**
 * One chapter's map: a row per thing it teaches, a column per blanks level.
 * A cell fills as its chords are learnt at that level, shows a check once they
 * are mastered; a ring marks where the learner is, a pulse the next step, and a
 * dashed outline a cell off the route. Clicking any cell goes there.
 */
function ChapterMap({
  chapter,
  here,
  next,
  standing,
  writes,
}: {
  chapter: Chapter;
  here: Cell | null;
  next: Cell | null;
  standing: StandingLookup;
  writes: CurriculumWrites;
}) {
  return (
    <Stack gap="xs">
      <Grid cols={4} gap="xs" aria-label={`${chapter.name} map`}>
        <span />
        {BLANKS.map((blanks) => (
          <Center
            key={blanks}
            className="text-faint-foreground"
            title={BLANKS_LABEL[blanks]}
          >
            <BlanksGlyph blanks={blanks} />
          </Center>
        ))}
        {chapter.rows.flatMap((row) => [
          <RowLabel key={row.id} row={row} />,
          ...BLANKS.map((blanks) => {
            const cell: Cell = { chapter: chapter.id, row: row.id, blanks };
            return (
              <MapCell
                key={`${row.id}-${blanks}`}
                cell={cell}
                row={row}
                here={here !== null && sameCell(here, cell)}
                next={next !== null && sameCell(next, cell)}
                standing={standing}
                onGo={() => writes.applyCell(cell)}
              />
            );
          }),
        ])}
      </Grid>
      <Line className="gap-md">
        <Text variant="caption" tone="faint">
          <span className="chord-legend" data-kind="here" /> you are here
        </Text>
        <Text variant="caption" tone="faint">
          <span className="chord-legend" data-kind="next" /> next
        </Text>
        <Text variant="caption" tone="faint">
          <span className="chord-legend" data-kind="off" /> off the route
        </Text>
      </Line>
    </Stack>
  );
}

function RowLabel({ row }: { row: PathRow }) {
  const [first] = row.tokens;
  if (first === undefined) {
    return (
      <Center className="chord-row-label" data-mode="" title={row.name}>
        <Text variant="caption" className="font-semibold">
          {row.name}
        </Text>
      </Center>
    );
  }
  return (
    <Stack
      direction="row"
      gap="none"
      className="chord-row-label"
      title={row.name}
    >
      {row.tokens.map((token) => (
        <Center
          key={token}
          className="chord-tone chord-row-chip"
          style={chordToneStyle(token)}
        >
          <ChordNumeral token={token} />
        </Center>
      ))}
    </Stack>
  );
}

function MapCell({
  cell,
  row,
  here,
  next,
  standing,
  onGo,
}: {
  cell: Cell;
  row: PathRow;
  here: boolean;
  next: boolean;
  standing: StandingLookup;
  onGo: () => void;
}) {
  const s = cellStanding(cell, standing);
  const route = onRoute(cell);
  const [first] = row.tokens;
  const title = `${cellName(cell)} — ${
    s === null
      ? "a key mode: nothing to score"
      : s.mastered
        ? "mastered"
        : `${String(Math.round(s.progress * 100))}% of the way`
  }${route ? "" : " (off the route)"}`;
  return (
    <button
      type="button"
      className="chord-tone chord-map-cell relative"
      style={first === undefined ? undefined : chordToneStyle(first)}
      data-here={here ? "" : undefined}
      data-next={next && !here ? "" : undefined}
      data-off-route={route ? undefined : ""}
      data-mastered={s?.mastered === true ? "" : undefined}
      title={title}
      aria-label={title}
      onClick={onGo}
    >
      <span
        className={cn(placedClasses({ decorative: true }), "chord-map-fill")}
        style={placedStyle({ start: 0, size: pct(s?.progress ?? 0) }, "fill")}
      />
      {s?.mastered === true && (
        <Center className="chord-map-check relative">
          <MdCheck aria-hidden="true" />
        </Center>
      )}
    </button>
  );
}
