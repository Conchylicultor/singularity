// Drives the Chord curriculum end to end against this checkout's deploy
// (`research/2026-09-23-apps-chord-trainer-free-curriculum.md`, verification).
//
// What it checks, in the order it does it:
//
//   1. the Path card opens, and holds the chord chips and the blanks control;
//   2. Blanks → All: the next round asks every box of a practised chord, and
//      gives only the chords that are not practised;
//   3. Blanks → One: the next round asks exactly one box;
//   4. Blanks → Half: the next round asks only boxes in the loop's second half;
//   5. a round played saves the blanks it was asked under;
//   6. a chord chip cycles Off → Practise → Hear only → Off, and its answer
//      button comes and goes with Practise;
//   7. a map cell (vi · One) sets both axes at once: vi practised alone, the
//      home chords only heard, one box blank, one answer button.
//
// Usage:
//   ./singularity run plugins/apps/plugins/chord/plugins/curriculum/e2e/curriculum-verify.ts
//   … [--timeout-min 15] [--headed]
//
// Mutates server state. The selection it finds is put back before the verdict
// prints (including after a crash). The rounds it plays CANNOT be undone: the
// run prints how many rows it left.

import type { Locator, Page } from "playwright";
import { z } from "zod";
import {
  agentFetch,
  boot,
  onBeforeFinish,
  numArg,
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
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import {
  SelectionSchema,
  cellSelection,
  chordState,
  practisedChords,
  sameSelection,
  type Blanks,
  type ChordState,
  type Selection,
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

/** An answer box: "Chord 2, 4 beats" (plus ": IV", ", given", ", right"…). */
const BOX = 'button[aria-label^="Chord "][aria-label*=" beat"]';
/** The box strip, whose width turns a box's left edge into a place in the loop. */
const STRIP = ".chord-strip-boxes";
/** One chord answer button. */
const PAD = '[aria-label="Chords to choose from"] button[aria-keyshortcuts]';

const vi = "9:3-4/0" as ChordToken;
const HOME = ["0:4-3/0", "5:4-3/0", "7:4-3/0"] as ChordToken[];

// ── Reading the app from outside ─────────────────────────────────────────────

async function readResource(name: string, query = ""): Promise<unknown> {
  const res = await agentFetch(`/api/resources/${name}${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/resources/${name} → HTTP ${res.status}`);
  }
  const { value } = z.object({ value: z.unknown() }).parse(await res.json());
  return value;
}

async function readSelection(): Promise<Selection> {
  return SelectionSchema.parse(await readResource("chord.curriculum"));
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

async function post(path: string, body: unknown): Promise<void> {
  const res = await agentFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} → HTTP ${res.status}: ${await res.text()}`);
  }
}

/** One selection in a few words, for the transcript. */
function selectionText(s: Selection): string {
  const chords = s.chords
    .map(
      (c) =>
        `${chordLabel(c.token).text}${c.state === "hear" ? " (hear)" : ""}`,
    )
    .join(" ");
  return `${chords} · blanks ${s.blanks} · modes ${s.modes.join(", ")}`;
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
// makes fractional ("Chord 4, 0.5 beats: I, C, given"); the letter name after
// the numeral is the chord in the song's key.
const BOX_LABEL =
  /^Chord (?<position>\d+), (?<beats>[\d.]+) beats?(?:: (?<chord>[^,]+)(?:, (?!given$|given,|right$|wrong$)(?<name>[^,]+))?)?(?<given>, given)?(?:, (?<mark>right|wrong))?$/;

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
 * The panel follows a write the script has already seen the server answer —
 * the selection is pushed — so a straight `isVisible()` asks the browser
 * before it has been told. This waits
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
function soloDigits(tokens: readonly ChordToken[]): Map<ChordToken, string> {
  const solo = new Map<ChordToken, string>();
  for (const group of chordKeyPlan(tokens)) {
    const only = group.tokens.length === 1 ? group.tokens[0] : undefined;
    if (only !== undefined) solo.set(only, group.digit);
  }
  return solo;
}

/**
 * Fill every asked box and let the round check itself, answering with the
 * weakest practised chord (the one the loop was chosen for). Returns the body
 * the trainer saved.
 */
async function playRound(
  page: Page,
  strip: StripRead,
  selection: Selection,
  progress: ChordProgress,
): Promise<z.infer<typeof RecordRoundBodySchema>> {
  const practised = practisedChords(selection);
  const solo = soloDigits(practised);
  const guess = weakestChord(practised, progress.chords);
  const digit = solo.get(guess) ?? [...solo.values()][0];
  if (digit === undefined) {
    throw new Error(
      `every practised chord shares its digit with another (${practised.map((token) => `${chordLabel(token).text} on ${chordDigit(token)}`).join(", ")}), so one keystroke answers nothing`,
    );
  }
  const saved = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/chord/rounds" &&
      res.request().method() === "POST",
    { timeout: 60_000 },
  );
  // A control the script clicked (a Blanks radio, a chip) keeps focus; the
  // digits are the trainer's keys, so hand focus back to the page first.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  for (let i = 0; i < asked(strip).length; i += 1) {
    await page.keyboard.press(digit);
  }
  const res = await saved.catch(async (err: unknown) => {
    if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
    const now = await readStrip(page);
    r.fail(
      "the round is saved",
      `pressed ${digit} ${String(asked(strip).length)}× and no POST /api/chord/rounds came — the strip reads ${now === null ? "nothing" : stripText(now)}`,
    );
    return r.finish();
  });
  if (!res.ok()) {
    r.fail("the round is saved", `POST /api/chord/rounds → ${res.status()}`);
    return r.finish();
  }
  return RecordRoundBodySchema.parse(res.request().postDataJSON());
}

// ── Where the learner is, and putting it back ────────────────────────────────

const start = await readSelection();
r.note(`the learner starts at ${selectionText(start)}`);

/**
 * Put the selection back: each chord's state, then the blanks. The key modes
 * are only changed by the map-cell step, which this run takes only when the
 * learner started in major keys alone — so they need no putting back.
 */
onBeforeFinish(async () => {
  const now = await readSelection();
  const tokens = new Set([
    ...start.chords.map((c) => c.token),
    ...now.chords.map((c) => c.token),
  ]);
  for (const token of tokens) {
    const want = chordState(start, token);
    if (chordState(now, token) !== want) {
      await post("/api/chord/curriculum/chord", { token, state: want });
    }
  }
  await post("/api/chord/curriculum/blanks", { blanks: start.blanks });
  const back = await readSelection();
  r.ok(
    "the selection is back where it was found",
    sameSelection(back, start),
    `${selectionText(back)} — started at ${selectionText(start)}`,
  );
});

await ensureReady(r, timeoutMs);

const progressTokens = [
  ...new Set([...HOME, vi, ...start.chords.map((c) => c.token)]),
];
const before = await readProgress(progressTokens);
let roundsPlayed = 0;
let answersGiven = 0;

/** Wait until the server's selection passes `check`. */
async function selectionWhere(
  what: string,
  check: (s: Selection) => boolean,
): Promise<Selection> {
  const settled = await waitFor(readSelection, check, {
    timeoutMs: 20_000,
    intervalMs: 250,
  });
  r.ok(what, settled.ok, selectionText(settled.value));
  return settled.value;
}

await withBrowser(async ({ session }) => {
  const { page, captured } = await session({
    viewport: { width: 1320, height: 1000 },
  });
  await boot(page, pathUrl("/chord"), { marker: BOX, timeoutMs });
  await requireRound(page, "the first round");

  // ── 1. the Path card holds the controls ────────────────────────────────────

  await page.getByRole("button", { name: "Path" }).click();
  const blanksButton = (label: string) =>
    page.getByRole("radio", { name: label, exact: true });
  r.ok(
    "the Path card opens to the blanks control",
    await shows(blanksButton("All"), 10_000),
    "no All radio in the Path card",
  );

  const setBlanks = async (label: string, blanks: Blanks) => {
    await blanksButton(label).click();
    const saved = await selectionWhere(
      `Blanks → ${label} is saved`,
      (s) => s.blanks === blanks,
    );
    // The page's own control reads the pushed selection: once it shows the
    // new value, the trainer has it too, and the next round is dealt with it.
    const shown = await waitFor(
      () => blanksButton(label).getAttribute("aria-checked"),
      (checked) => checked === "true",
      { timeoutMs: 15_000, intervalMs: 200 },
    );
    r.ok(
      `the page shows Blanks → ${label}`,
      shown.ok,
      `aria-checked=${String(shown.value)}`,
    );
    return saved;
  };
  const isPractised = (s: Selection, label: string | null) =>
    label !== null &&
    practisedChords(s).some((t) => chordLabel(t).text === label);

  // ── 2. All ─────────────────────────────────────────────────────────────────

  let selection = await setBlanks("All", "all");
  let strip = await nextSong(page, "a whole-loop round");
  r.note(`whole-loop round: ${stripText(strip)}`);
  r.ok(
    "at All the round gives only chords that are not practised",
    given(strip).every((box) => !isPractised(selection, box.chord)),
    stripText(strip),
  );
  r.eq(
    "the heading counts the asked boxes",
    strip.heading,
    `Chord 1 of ${String(asked(strip).length)}`,
  );

  // ── 3. One ─────────────────────────────────────────────────────────────────

  selection = await setBlanks("One", "one");
  strip = await nextSong(page, "a one-box round");
  r.note(`one-box round: ${stripText(strip)}`);
  r.eq("at One the round asks exactly one box", asked(strip).length, 1);

  // ── 4. Half ────────────────────────────────────────────────────────────────

  selection = await setBlanks("Half", "half");
  strip = await nextSong(page, "a cadence round");
  for (let tries = 0; tries < 6 && strip.boxes.length < 2; tries += 1) {
    strip = await nextSong(page, "a cadence round with more than one box");
  }
  r.note(`cadence round: ${stripText(strip)}`);
  const secondHalf = asked(strip).every((box) => box.fraction >= 0.49);
  const fallback =
    asked(strip).length === 1 &&
    strip.boxes.filter((b) => b.fraction >= 0.49).every((b) => b.given);
  r.ok(
    "at Half the round asks only the second half (or its last practised box, when the second half holds none)",
    asked(strip).length > 0 && (secondHalf || fallback),
    stripText(strip),
  );

  // ── 5. the saved round carries its blanks ──────────────────────────────────

  const body = await playRound(page, strip, selection, before);
  roundsPlayed += 1;
  answersGiven += body.answers.length;
  r.eq("the saved round says it was asked at Half", body.blanks, "half");

  // ── 6. a chord chip cycles its three states ────────────────────────────────

  const viLabel = chordLabel(vi).text;
  const chip = (state: string) =>
    page.getByRole("button", { name: `${viLabel}, ${state}`, exact: true });
  const cycleTo = async (from: string, to: ChordState) => {
    await chip(from).click();
    return selectionWhere(
      `the ${viLabel} chip goes to ${to}`,
      (s) => chordState(s, vi) === to,
    );
  };
  if (chordState(await readSelection(), vi) !== "off") {
    await post("/api/chord/curriculum/chord", { token: vi, state: "off" });
    await selectionWhere(
      `${viLabel} starts off`,
      (s) => chordState(s, vi) === "off",
    );
  }
  const padsOff = await page.locator(PAD).count();
  await cycleTo("Off", "practice");
  const padsOn = await waitFor(
    () => page.locator(PAD).count(),
    (n) => n === padsOff + 1,
    { timeoutMs: 20_000, intervalMs: 250 },
  );
  r.eq(
    `practising ${viLabel} adds its answer button`,
    padsOn.value,
    padsOff + 1,
  );
  await cycleTo("Practise", "hear");
  const padsHear = await waitFor(
    () => page.locator(PAD).count(),
    (n) => n === padsOff,
    { timeoutMs: 20_000, intervalMs: 250 },
  );
  r.eq(
    `hearing ${viLabel} only takes its button away`,
    padsHear.value,
    padsOff,
  );
  await cycleTo("Hear only", "off");

  // ── 7. a map cell sets both axes ───────────────────────────────────────────

  const startModes = [...start.modes].sort().join(",");
  if (startModes !== "major") {
    r.note(
      `skipped the map-cell step: the learner started with key modes ${startModes}, which a cell would change and this run could not put back`,
    );
  } else {
    await page
      .getByRole("button", { name: /^vi · One —/ })
      .first()
      .click();
    const want = cellSelection({ chapter: "major", row: "vi", blanks: "one" });
    const atCell = await selectionWhere(
      "the vi · One cell sets the whole selection",
      (s) => sameSelection(s, want),
    );
    r.ok(
      "vi is practised alone; the home chords are only heard",
      chordState(atCell, vi) === "practice" &&
        HOME.every((t) => chordState(atCell, t) === "hear"),
      selectionText(atCell),
    );
    const onePad = await waitFor(
      () => page.locator(PAD).count(),
      (n) => n === 1,
      { timeoutMs: 20_000, intervalMs: 250 },
    );
    r.eq("one answer button: vi's", onePad.value, 1);
  }

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("\n"),
  );
});

const end = await readProgress(progressTokens);
r.note(
  `left behind: ${roundsPlayed} rounds and ${answersGiven} answers, which nothing can undo ` +
    `(all time is now ${end.allTime.songs} songs, ${end.allTime.answers} answers).`,
);

await r.finish();
