// Drives the Chord curriculum end to end against this checkout's deploy
// (`research/2026-09-19-apps-chord-trainer-curriculum.md`, verification step 4).
//
// What it checks, in the order it does it:
//
//   1. a learner at level 1 is asked for ONE chord: the boxes of the chord
//      being practised wait, every other box is given and already shows its own
//      chord, and the heading counts the asked ones only;
//   2. filling the asked boxes checks the round and saves it — the saved body
//      counts the asked boxes and the given ones separately, and
//      `chord.progress` moves by exactly the asked boxes;
//   3. **Add** takes the cadence rung: the level goes up, the next step moves
//      on, and a round now asks the loop's second half;
//   4. **Add** again takes the whole-loop rung, and a round asks every box;
//   5. the next step is a chord; the ghost pad at the end of the grid adds it,
//      a fourth chord button appears, and while the new chord is fresh a round
//      asks only its boxes;
//   6. **Undo** takes that step back: the palette and the next step return to
//      what they were.
//
// The rungs only become visible once no chord is FRESH — a chord with fewer
// than `FRESH_ANSWERS` answers is asked alone whatever the rung says — so the
// script first plays rounds until every unlocked chord is past that threshold.
// That is the warm-up, and it is the slow part of the run.
//
// Usage:
//   ./singularity run plugins/apps/plugins/chord/plugins/curriculum/e2e/curriculum-verify.ts
//   … [--warmup-rounds 80] [--timeout-min 15] [--headed]
//
// Mutates server state. The steps it unlocks are undone before the verdict
// prints (including after a crash), so the ladder is left where it was found.
// The rounds it plays CANNOT be undone: the run prints how many rows it left.

import type { Locator, Page } from "playwright";
import { z } from "zod";
import {
  agentFetch,
  boot,
  numArg,
  onBeforeFinish,
  pathUrl,
  report,
  waitFor,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { ensureReady } from "@plugins/apps/plugins/chord/plugins/song-index/e2e";
import {
  ChordProgressSchema,
  encodeProgressParams,
  RecordRoundBodySchema,
  type ChordProgress,
  type ChordStanding,
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import {
  CurriculumSchema,
  FRESH_ANSWERS,
  NextStepAnswerSchema,
  type Curriculum,
  type NextStep,
  type NextStepAnswer,
} from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import {
  chordDigit,
  chordKeyPlan,
  chordLabel,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { weakestChord } from "@plugins/apps/plugins/chord/plugins/trainer/core";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";

const r = report("chord curriculum");
const timeoutMs = numArg("timeout-min", 15) * 60_000;
/** How many rounds the warm-up may play before it gives up (and fails). */
const warmupBudget = numArg("warmup-rounds", 80);

/** An answer box: "Chord 2, 4 beats" (plus ": IV", ", given", ", right"…). */
const BOX = 'button[aria-label^="Chord "][aria-label*=" beat"]';
/** The box strip, whose width turns a box's left edge into a place in the loop. */
const STRIP = ".chord-strip-boxes";
/** One chord button. The ghost next-step pad carries no key, so it is not one. */
const PAD = '[aria-label="Chords to choose from"] button[aria-keyshortcuts]';

// ── Reading the app from outside ─────────────────────────────────────────────

async function readResource(name: string, query = ""): Promise<unknown> {
  const res = await agentFetch(`/api/resources/${name}${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/resources/${name} → HTTP ${res.status}`);
  }
  const { value } = z.object({ value: z.unknown() }).parse(await res.json());
  return value;
}

async function readCurriculum(): Promise<Curriculum> {
  return CurriculumSchema.parse(await readResource("chord.curriculum"));
}

async function readProgress(
  tokens: readonly ChordToken[],
): Promise<ChordProgress> {
  const params = encodeProgressParams({
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tokens: [...tokens],
  });
  const query = `?${new URLSearchParams(params).toString()}`;
  return ChordProgressSchema.parse(await readResource("chord.progress", query));
}

/** The step on offer, as the panel reads it. A POST, but it writes nothing. */
async function readNextStep(): Promise<NextStepAnswer> {
  const res = await agentFetch("/api/chord/curriculum/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `POST /api/chord/curriculum/next → HTTP ${res.status}: ${await res.text()}`,
    );
  }
  return NextStepAnswerSchema.parse(await res.json());
}

/** One step in a few words, for the transcript. */
function stepText(step: NextStep): string {
  if (step.kind === "ask") {
    return step.rule === "half" ? "name the cadence" : "name the whole loop";
  }
  const chords = step.tokens.map((token) => chordLabel(token).text).join(" ");
  const modes = step.modes.join(", ");
  return [chords, modes].filter((part) => part !== "").join(" + ");
}

function answersOf(standings: readonly ChordStanding[]): number[] {
  return standings.map((standing) => standing.answers);
}

// ── Reading the answer strip ─────────────────────────────────────────────────

type BoxRead = {
  /** The box's place in the round, 0-based, in beat order. */
  position: number;
  beats: number;
  /** The chord it shows: its own once given or checked, else the answer given. */
  chord: string | null;
  /** Given boxes name themselves; the learner is not asked about them. */
  given: boolean;
  mark: "right" | "wrong" | null;
  /**
   * Where the box starts in the loop, 0…1 — its left edge over the strip's
   * width, which is how the strip places it (`beatX`: gridStart / beats). This
   * is what makes "the second half of the loop" a thing a script can see.
   */
  fraction: number;
};

type StripRead = {
  heading: string;
  /** The song on screen, which names the loop together with the boxes below. */
  song: string;
  boxes: BoxRead[];
};

// A box lasts a number of beats, which a chord shorter than the grid's beat
// makes fractional ("Chord 4, 0.5 beats: I, given").
const BOX_LABEL =
  /^Chord (?<position>\d+), (?<beats>[\d.]+) beats?(?:: (?<chord>[^,]+))?(?<given>, given)?(?:, (?<mark>right|wrong))?$/;

/**
 * The mark a checked box carries, as one of the two the trainer draws. A third
 * word would mean the strip has grown a state this script cannot read, which is
 * worth stopping for rather than quietly recording as "not marked".
 */
function boxMark(label: string, text: string | undefined): BoxRead["mark"] {
  if (text === undefined) return null;
  if (text === "right" || text === "wrong") return text;
  throw new Error(
    `An answer box reads "${label}": "${text}" is not a mark this script knows (right, wrong)`,
  );
}

/** The strip as it stands, or null while the trainer has no round on screen. */
async function readStrip(page: Page): Promise<StripRead | null> {
  const raw = await page.evaluate(
    ({ strip, box }) => {
      const host = document.querySelector(strip);
      if (host === null) return null;
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width === 0) return null;
      return {
        heading: document.querySelector("h2")?.textContent ?? "",
        song: document.querySelector("h1")?.textContent ?? "",
        boxes: [...host.querySelectorAll(box)].map((el) => ({
          label: el.getAttribute("aria-label") ?? "",
          fraction:
            (el.getBoundingClientRect().left - hostRect.left) / hostRect.width,
        })),
      };
    },
    { strip: STRIP, box: BOX },
  );
  if (raw === null) return null;
  const boxes = raw.boxes.map(({ label, fraction }) => {
    const parsed = BOX_LABEL.exec(label)?.groups;
    if (parsed === undefined) {
      throw new Error(
        `An answer box reads "${label}", which is not a box label`,
      );
    }
    return {
      position: Number(parsed.position) - 1,
      beats: Number(parsed.beats),
      chord: parsed.chord ?? null,
      given: parsed.given !== undefined,
      mark: boxMark(label, parsed.mark),
      fraction,
    };
  });
  return {
    heading: raw.heading.replace(/\s+/g, " ").trim(),
    song: raw.song.replace(/\s+/g, " ").trim(),
    boxes,
  };
}

/**
 * Which loop this is: the song, and the boxes it drew. Two rounds in a row
 * never share one — the trainer leaves out the sections it has just played —
 * so this is what says the screen has really moved on rather than been read
 * again before it re-rendered.
 */
function loopIdentity(strip: StripRead): string {
  const boxes = strip.boxes
    .map((box) => `${box.chord ?? "–"}@${box.fraction.toFixed(3)}/${box.beats}`)
    .join(",");
  return `${strip.song}|${boxes}`;
}

/** A round still waiting for its answers, rather than a checked one. */
const isUnanswered = (strip: StripRead): boolean =>
  /^Chord \d+ of \d+$/.test(strip.heading);

const asked = (strip: StripRead): BoxRead[] =>
  strip.boxes.filter((box) => !box.given);
const given = (strip: StripRead): BoxRead[] =>
  strip.boxes.filter((box) => box.given);

/** How a strip reads in one line, for a note or a failure. */
function stripText(strip: StripRead): string {
  const boxes = strip.boxes
    .map(
      (box) =>
        `${box.given ? "given" : "ask"} ${box.chord ?? "–"}@${box.fraction.toFixed(2)}`,
    )
    .join(", ");
  return `"${strip.heading}" — ${boxes}`;
}

/**
 * Whether something turns up on screen within the budget.
 *
 * The panel and the ghost pad follow a write the script has already seen the
 * server answer — the standing is pushed and the next step re-read — so a
 * straight `isVisible()` asks the browser before it has been told. This waits
 * for the app to catch up and still answers false rather than throwing, so the
 * check that called it reports a failure instead of ending the run.
 */
async function shows(locator: Locator, timeoutMs = 30_000): Promise<boolean> {
  return locator.waitFor({ state: "visible", timeout: timeoutMs }).then(
    () => true,
    (err: unknown) => {
      if (err instanceof Error && err.name === "TimeoutError") return false;
      throw err;
    },
  );
}

/**
 * Whether the panel says the learner is on this level — the line that names
 * where they ARE ("Your level"), not the locked row below it, which names the
 * level the next step would reach and so always reads one higher.
 *
 * It doubles as the barrier before a round is asked about: the level and the
 * ask rule are one value, so a panel showing the new level is a browser that
 * has the new rule.
 */
async function panelShowsLevel(page: Page, level: number): Promise<boolean> {
  return shows(
    page
      .getByLabel("Your level")
      .getByText(`Level ${String(level)}`, { exact: true }),
  );
}

/**
 * What the trainer shows where a round should be, when there is none — "No
 * song fits these chords yet", a failed query, the index still loading.
 *
 * It does not catch: a page that cannot even be read is a different failure
 * from a page with no round in it, and saying the second when the first
 * happened is how a verification script ends up describing the wrong problem.
 */
async function whyNoRound(page: Page): Promise<string> {
  const text = await page.locator("body").first().innerText();
  return text.replace(/\s+/g, " ").slice(0, 400);
}

/**
 * Wait for a round that has not been answered yet — the heading counting the
 * boxes still to name. Never returns without one: no round is a failure, with
 * whatever the screen says instead.
 */
async function requireRound(
  page: Page,
  what: string,
  /** A loop that is already on screen: wait for one that is not it. */
  notThis: string | null = null,
): Promise<StripRead> {
  const settled = await waitFor(
    () => readStrip(page),
    (strip) =>
      strip !== null &&
      isUnanswered(strip) &&
      (notThis === null || loopIdentity(strip) !== notThis),
    { timeoutMs: 90_000, intervalMs: 250 },
  );
  const strip = settled.value;
  if (settled.ok && strip !== null) return strip;
  r.fail(
    `a round to play (${what})`,
    `waited ${Math.round(settled.waitedMs / 1000)} s; ` +
      (strip === null
        ? `the screen reads: ${await whyNoRound(page)}`
        : notThis !== null && loopIdentity(strip) === notThis
          ? `the trainer stayed on the same loop: ${stripText(strip)}`
          : `the round on screen reads ${stripText(strip)}`),
  );
  return r.finish();
}

/**
 * Drop the loop on screen and wait for the NEXT one — a different loop, not
 * just a strip that reads like a round. The round already on screen is also
 * unanswered whenever nothing was filled into it, so waiting on the heading
 * alone reads the old round back and asserts about the rule it was built with.
 */
async function nextSong(page: Page, what: string): Promise<StripRead> {
  const leaving = await readStrip(page);
  await page.keyboard.press("Enter");
  return requireRound(
    page,
    what,
    leaving === null ? null : loopIdentity(leaving),
  );
}

// ── Playing a round ──────────────────────────────────────────────────────────

/** The digits that answer on their own — a shared digit needs a second key. */
function soloDigits(unlocked: readonly ChordToken[]): Map<ChordToken, string> {
  const solo = new Map<ChordToken, string>();
  for (const group of chordKeyPlan(unlocked)) {
    const only = group.tokens.length === 1 ? group.tokens[0] : undefined;
    if (only !== undefined) solo.set(only, group.digit);
  }
  return solo;
}

/**
 * Fill every asked box and let the round check itself, answering with the
 * chord the trainer is most likely asking for (the weakest one, which is what
 * the loop was chosen for). A wrong answer would do for everything this script
 * asserts; aiming at the right one only keeps the history it leaves plausible.
 */
async function playRound(
  page: Page,
  strip: StripRead,
  curriculum: Curriculum,
  progress: ChordProgress,
): Promise<{ answers: number; givenCount: number }> {
  const unlocked = curriculum.unlocked.map((u) => u.token);
  const solo = soloDigits(unlocked);
  const guess = weakestChord(unlocked, progress.chords);
  const digit = solo.get(guess) ?? [...solo.values()][0];
  if (digit === undefined) {
    throw new Error(
      `every unlocked chord shares its digit with another (${unlocked.map((token) => `${chordLabel(token).text} on ${chordDigit(token)}`).join(", ")}), so one keystroke answers nothing`,
    );
  }
  const saved = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/chord/rounds" &&
      res.request().method() === "POST",
    { timeout: 60_000 },
  );
  for (let i = 0; i < asked(strip).length; i += 1) {
    await page.keyboard.press(digit);
  }
  const res = await saved;
  if (!res.ok()) {
    r.fail("the round is saved", `POST /api/chord/rounds → ${res.status()}`);
    return r.finish();
  }
  const body = RecordRoundBodySchema.parse(res.request().postDataJSON());
  return { answers: body.answers.length, givenCount: body.givenCount };
}

// ── Where the ladder is, and putting it back ─────────────────────────────────

const start = await readCurriculum();
r.note(
  `the learner starts at level ${start.level}, ask rule "${start.askRule}", ` +
    `${start.unlocked.length} chords (${start.unlocked.map((u) => chordLabel(u.token).text).join(" ")})`,
);
r.ok(
  "the learner starts at level 1, naming one chord",
  start.level === 1 && start.askRule === "target",
  `level ${start.level}, ask rule "${start.askRule}" — press Undo in the trainer until it reads Level 1, then run this again`,
);
if (start.level !== 1) await r.finish();

/** Every step this run took, taken back — however the run ends. */
onBeforeFinish(async () => {
  let standing = await readCurriculum();
  while (standing.level > start.level) {
    const res = await agentFetch("/api/chord/curriculum/undo", {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(
        `undoing back to level ${start.level} failed at level ${standing.level}: POST /api/chord/curriculum/undo → HTTP ${res.status}: ${await res.text()}`,
      );
    }
    standing = await readCurriculum();
  }
  r.note(
    `the ladder is back where it was found: level ${standing.level}, ask rule "${standing.askRule}", ` +
      `${standing.unlocked.length} chords`,
  );
});

// ── The index has to be loaded ───────────────────────────────────────────────

await ensureReady(r, timeoutMs);

const startTokens = start.unlocked.map((u) => u.token);
const before = await readProgress(startTokens);
r.note(
  `progress before: all time ${before.allTime.songs} songs, ${before.allTime.answers} answers; ` +
    `answers per chord ${JSON.stringify(answersOf(before.chords))}`,
);

/** Rounds this run played, all of which stay in the learner's history. */
let roundsPlayed = 0;
let answersGiven = 0;

await withBrowser(async ({ session }) => {
  const { page, captured } = await session({
    viewport: { width: 1320, height: 900 },
  });

  // ── 1. level 1 asks for one chord ──────────────────────────────────────────

  await boot(page, pathUrl("/chord"), { marker: BOX, timeoutMs });
  // A loop of one single chord has nothing to give away, so it says nothing
  // about scaffolding. Move on until a loop with more than one box turns up.
  let first = await requireRound(page, "the first round");
  for (let tries = 0; tries < 6 && first.boxes.length < 2; tries += 1) {
    first = await nextSong(page, "a first round with more than one box");
  }
  r.note(`level 1 round: ${stripText(first)}`);
  r.ok(
    "level 1 asks about part of the loop, not all of it",
    asked(first).length >= 1 && asked(first).length < first.boxes.length,
    `${asked(first).length} asked of ${first.boxes.length} boxes — ${stripText(first)}`,
  );
  r.ok(
    "every given box already shows its chord",
    given(first).every((box) => box.chord !== null),
    stripText(first),
  );
  r.eq(
    "the heading counts the asked boxes only",
    first.heading,
    `Chord 1 of ${String(asked(first).length)}`,
  );
  r.ok(
    "no given box is marked right or wrong",
    given(first).every((box) => box.mark === null),
    stripText(first),
  );

  // ── 2. filling the asked boxes checks the round, and saves it ──────────────

  const askedFirst = asked(first).length;
  const givenFirst = given(first).length;
  const saved = await playRound(page, first, start, before);
  roundsPlayed += 1;
  answersGiven += saved.answers;
  r.eq(
    "the saved round counts the boxes the learner named",
    saved.answers,
    askedFirst,
  );
  r.eq(
    "the saved round counts the given boxes as scaffolding",
    saved.givenCount,
    givenFirst,
  );

  const checked = await waitFor(
    () => readStrip(page),
    (strip) => strip !== null && /right in/.test(strip.heading),
    { timeoutMs: 20_000, intervalMs: 200 },
  );
  const scored = checked.value;
  if (scored === null) {
    r.fail("the round is checked", "the strip vanished after the last fill");
    return r.finish();
  }
  r.ok(
    "the round checks itself once the last asked box is filled",
    new RegExp(`^\\d+ of ${String(askedFirst)} right in \\d+\\.\\d s$`).test(
      scored.heading,
    ),
    scored.heading,
  );
  const askedChords = new Set(asked(scored).map((box) => box.chord));
  r.ok(
    "every box the round asked about held the same chord — the one being practised",
    askedChords.size === 1,
    `asked chords ${[...askedChords].join(", ")} — ${stripText(scored)}`,
  );

  const moved = await waitFor(
    () => readProgress(startTokens),
    (p) => p.allTime.songs === before.allTime.songs + 1,
    { timeoutMs: 20_000, intervalMs: 500 },
  );
  r.ok(
    "chord.progress counts one more song",
    moved.ok,
    JSON.stringify(moved.value.allTime),
  );
  r.eq(
    "chord.progress counts one answer per asked box, and none for the given ones",
    moved.value.allTime.answers,
    before.allTime.answers + askedFirst,
  );

  // ── The warm-up: play until no chord is fresh ──────────────────────────────
  //
  // A chord with fewer than FRESH_ANSWERS answers is asked ALONE whatever the
  // ask rule says, so on a new learner the cadence and whole-loop rungs change
  // nothing that can be seen. The rungs are what checks 3 and 4 are about, so
  // the run first plays the freshness off every unlocked chord.

  const warmupStarted = performance.now();
  let progress = moved.value;
  let strip = await nextSong(page, "the round after the first");
  while (Math.min(...answersOf(progress.chords)) < FRESH_ANSWERS) {
    if (roundsPlayed >= warmupBudget) break;
    const played = await playRound(page, strip, start, progress);
    roundsPlayed += 1;
    answersGiven += played.answers;
    progress = await waitFor(
      () => readProgress(startTokens),
      (p) => p.allTime.songs >= before.allTime.songs + roundsPlayed,
      { timeoutMs: 20_000, intervalMs: 300 },
    ).then((settled) => settled.value);
    strip = await nextSong(page, "the next warm-up round");
  }
  const warmupMin = Math.min(...answersOf(progress.chords));
  r.note(
    `warm-up: ${roundsPlayed} rounds, ${answersGiven} answers, ` +
      `${Math.round((performance.now() - warmupStarted) / 1000)} s — answers per chord ${JSON.stringify(answersOf(progress.chords))}`,
  );
  r.ok(
    `every chord is past ${String(FRESH_ANSWERS)} answers, so the ask rule is what decides the round`,
    warmupMin >= FRESH_ANSWERS,
    `the least-answered chord has ${warmupMin} answers after ${roundsPlayed} rounds (budget ${warmupBudget}) — raise --warmup-rounds`,
  );
  if (warmupMin < FRESH_ANSWERS) return r.finish();

  // ── 3. Add takes the cadence rung ──────────────────────────────────────────

  const offered = await readNextStep();
  r.ok(
    "the next step on offer is the cadence rung",
    offered.kind === "step" &&
      offered.step.kind === "ask" &&
      offered.step.rule === "half",
    JSON.stringify(offered),
  );
  const addButton = page.getByRole("button", { name: "Add", exact: true });
  await addButton.waitFor({ state: "visible", timeout: 30_000 });
  r.ok(
    "the panel names the step it is offering",
    await shows(page.getByText("Name the cadence", { exact: true }).first()),
    'no "Name the cadence" row under Your chords',
  );
  await addButton.click();

  const atHalf = await waitFor(readCurriculum, (c) => c.level === 2, {
    timeoutMs: 20_000,
    intervalMs: 250,
  });
  r.ok(
    "Add raises the level",
    atHalf.ok && atHalf.value.level === 2,
    JSON.stringify(atHalf.value),
  );
  r.eq("the round now asks for the cadence", atHalf.value.askRule, "half");
  r.ok(
    "the panel says the learner is on level 2",
    await panelShowsLevel(page, 2),
    'the "Your level" line never read "Level 2"',
  );
  const afterHalf = await readNextStep();
  r.ok(
    "the next step moves on to the whole loop",
    afterHalf.kind === "step" &&
      afterHalf.step.kind === "ask" &&
      afterHalf.step.rule === "all",
    JSON.stringify(afterHalf),
  );

  // The round on screen keeps the sheet it was built with, so the rung shows
  // on the NEXT loop — and only on one with a box in each half to tell apart.
  strip = await nextSong(page, "the first cadence round");
  for (let tries = 0; tries < 6 && strip.boxes.length < 2; tries += 1) {
    strip = await nextSong(page, "a cadence round with more than one box");
  }
  r.note(`cadence round: ${stripText(strip)}`);
  r.ok(
    "at the cadence rung the round asks every box of the loop's second half",
    asked(strip).length > 0 &&
      asked(strip).every((box) => box.fraction >= 0.49) &&
      given(strip).every((box) => box.fraction < 0.49),
    stripText(strip),
  );
  r.ok(
    "the boxes before the midpoint are given",
    given(strip).length > 0,
    `nothing was given — ${stripText(strip)}`,
  );
  r.eq(
    "the heading counts the cadence's boxes",
    strip.heading,
    `Chord 1 of ${String(asked(strip).length)}`,
  );

  // ── 4. Add again takes the whole-loop rung ─────────────────────────────────

  await addButton.click();
  const atAll = await waitFor(readCurriculum, (c) => c.level === 3, {
    timeoutMs: 20_000,
    intervalMs: 250,
  });
  r.ok(
    "Add raises the level again",
    atAll.ok && atAll.value.level === 3,
    JSON.stringify(atAll.value),
  );
  r.eq("the round now asks for the whole loop", atAll.value.askRule, "all");
  r.ok(
    "the panel says the learner is on level 3",
    await panelShowsLevel(page, 3),
    'the "Your level" line never read "Level 3"',
  );

  strip = await nextSong(page, "the first whole-loop round");
  r.note(`whole-loop round: ${stripText(strip)}`);
  r.ok(
    "at the whole-loop rung every box is asked",
    given(strip).length === 0 && asked(strip).length === strip.boxes.length,
    stripText(strip),
  );

  // ── 5. a chord step grows the palette ──────────────────────────────────────

  const chordStep = await readNextStep();
  if (chordStep.kind !== "step" || chordStep.step.kind !== "chords") {
    r.fail(
      "the next step after the rungs is a chord",
      JSON.stringify(chordStep),
    );
    return r.finish();
  }
  const newTokens = chordStep.step.tokens;
  const newToken = newTokens[0];
  if (newToken === undefined) {
    r.fail(
      "the chord step opens at least one chord",
      JSON.stringify(chordStep),
    );
    return r.finish();
  }
  const newLabel = chordLabel(newToken).text;
  r.note(
    `the next step is ${stepText(chordStep.step)} (${chordStep.step.stage}), opening ${chordStep.windows} loop windows`,
  );
  // The browser re-reads the next step after each write, and working it out
  // scans the index, so the row and the pad arrive a moment after the write
  // this script has already seen answered.
  const ghost = page.getByRole("button", { name: "Next step", exact: true });
  r.ok(
    "a chord step shows as the ghost pad at the end of the grid",
    await shows(ghost),
    'no pad named "Next step"',
  );
  r.ok(
    "the panel names the chord it is offering",
    await shows(page.getByText(newLabel, { exact: true }).first()),
    `no "${newLabel}" row under Your chords`,
  );

  const padsBefore = await page.locator(PAD).count();
  r.eq(
    "the grid has one button per unlocked chord",
    padsBefore,
    atAll.value.unlocked.length,
  );
  await ghost.click();

  const atChord = await waitFor(readCurriculum, (c) => c.level === 4, {
    timeoutMs: 20_000,
    intervalMs: 250,
  });
  r.ok(
    "the pad adds the chord",
    atChord.ok && atChord.value.level === 4,
    JSON.stringify(atChord.value),
  );
  r.ok(
    `${newLabel} is unlocked, at level 4`,
    atChord.value.unlocked.some((u) => u.token === newToken && u.level === 4),
    JSON.stringify(atChord.value.unlocked),
  );
  r.ok(
    "the panel says the learner is on level 4",
    await panelShowsLevel(page, 4),
    'the "Your level" line never read "Level 4"',
  );
  const padsAfter = await waitFor(
    () => page.locator(PAD).count(),
    (count) => count === padsBefore + newTokens.length,
    { timeoutMs: 20_000, intervalMs: 250 },
  );
  r.eq(
    "a chord button appears for it",
    padsAfter.value,
    padsBefore + newTokens.length,
  );

  // The loops already queued were chosen before the step, for the old palette
  // and the old target, so they still ask for the whole loop. The first round
  // the new chord was chosen for is the first one with a given box again —
  // that can only be the fresh-chord rule, and the only fresh chord is this one.
  let skipped = 0;
  strip = await nextSong(page, `the first round targeting ${newLabel}`);
  while (given(strip).length === 0 && skipped < 15) {
    skipped += 1;
    strip = await nextSong(page, `a round targeting ${newLabel}`);
  }
  r.note(
    `the round asking for ${newLabel} arrived after ${skipped} queued loops chosen before the step`,
  );
  r.ok(
    `while ${newLabel} is fresh a round asks only part of the loop again`,
    given(strip).length > 0,
    `15 rounds still asked for every box — ${stripText(strip)}`,
  );
  if (given(strip).length > 0) {
    const played = await playRound(page, strip, atChord.value, progress);
    roundsPlayed += 1;
    answersGiven += played.answers;
    const revealed = await waitFor(
      () => readStrip(page),
      (s) => s !== null && /right in/.test(s.heading),
      { timeoutMs: 20_000, intervalMs: 200 },
    );
    const shown = revealed.value;
    const chords = shown === null ? [] : asked(shown).map((box) => box.chord);
    r.ok(
      `the boxes it asks about are all ${newLabel}`,
      chords.length > 0 && chords.every((chord) => chord === newLabel),
      `asked chords ${chords.join(", ")} — ${shown === null ? "no strip" : stripText(shown)}`,
    );
  }

  // ── 6. Undo takes the last step back ───────────────────────────────────────

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.waitFor({ state: "visible", timeout: 20_000 });
  await undo.click();
  const undone = await waitFor(readCurriculum, (c) => c.level === 3, {
    timeoutMs: 20_000,
    intervalMs: 250,
  });
  r.ok(
    "Undo takes the last step back",
    undone.ok && undone.value.level === 3,
    JSON.stringify(undone.value),
  );
  r.ok(
    `${newLabel} is locked again`,
    !undone.value.unlocked.some((u) => u.token === newToken),
    JSON.stringify(undone.value.unlocked),
  );
  r.eq("the ask rule is back to the whole loop", undone.value.askRule, "all");
  r.ok(
    "the panel says the learner is back on level 3",
    await panelShowsLevel(page, 3),
    'the "Your level" line never read "Level 3" again',
  );
  const padsUndone = await waitFor(
    () => page.locator(PAD).count(),
    (count) => count === padsBefore,
    { timeoutMs: 20_000, intervalMs: 250 },
  );
  r.eq("its chord button goes away", padsUndone.value, padsBefore);
  const offeredAgain = await readNextStep();
  r.ok(
    `the next step on offer is ${newLabel} again`,
    offeredAgain.kind === "step" &&
      offeredAgain.step.kind === "chords" &&
      offeredAgain.step.tokens[0] === newToken,
    JSON.stringify(offeredAgain),
  );

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("\n"),
  );
});

// ── What this run leaves behind ──────────────────────────────────────────────

const end = await readProgress(startTokens);
r.note(
  `left behind: ${roundsPlayed} rounds and ${answersGiven} answers, which nothing can undo ` +
    `(all time is now ${end.allTime.songs} songs, ${end.allTime.answers} answers). ` +
    `The steps unlocked are taken back below; the song index keeps the load request.`,
);

await r.finish();
