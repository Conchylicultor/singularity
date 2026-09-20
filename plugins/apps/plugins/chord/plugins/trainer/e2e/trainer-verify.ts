// Drives the Chord trainer end to end against this checkout's deploy
// (`research/2026-09-18-apps-chord-trainer-app.md`, verification step 4):
//
//   1. the song index reaches `ready`;
//   2. /chord shows a round: as many answer boxes as its heading says;
//   3. Play is pressed, and the player's first word about the video — playing,
//      or an error code — is reported to POST /api/chord/videos/:id/playback
//      (headless Chromium may not play YouTube; either outcome proves the
//      report path, and an error moves the trainer to the next loop);
//   4. every box is filled from the keyboard (1 = I, 4 = IV, 5 = V); the
//      heading shows the score; POST /api/chord/rounds answers with a round id;
//   5. `chord.progress` moves: one more song and one more answer per box, all
//      time — and the side panel shows the new song count;
//   6. reveal is switched to Keyboard: the song card names the key, every box
//      names its chord, and the keys the keyboard lights are exactly the notes
//      `chordVoicing` gives for the chord clicked — the piano's own call. The
//      switch is put back where it was found.
//
// Usage:
//   ./singularity run plugins/apps/plugins/chord/plugins/trainer/e2e/trainer-verify.ts [--timeout-min 15] [--headed]
//
// Mutates server state: records the index request (may start a load), one
// checked round with its answers, and the player's report on one or two videos.

import {
  agentFetch,
  boot,
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
  type ChordProgress,
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import { CurriculumSchema } from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import {
  chordKeyPlan,
  chordLabel,
  chordVoicing,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  hookpadTonicPc,
  type HookpadMode,
} from "@plugins/integrations/plugins/hooktheory/core";
import { VideoStatusSchema } from "@plugins/apps/plugins/chord/plugins/video-availability/core";
import type { Page } from "playwright";
import { z } from "zod";

const r = report("chord trainer");
const timeoutMs = numArg("timeout-min", 15) * 60_000;

/** An answer box: "Chord 2, 4 beats" (plus ": IV", ", given", ", right"…). */
const BOX = 'button[aria-label^="Chord "][aria-label*=" beat"]';
/** The boxes the round actually asks about — the given ones name themselves. */
const ASKED_BOX = `${BOX}:not([aria-label*=", given"])`;
const HEADING = "h2";

/** The song card's key tag, as `songKeyLabel` writes it: "G major", "E♭ mixolydian". */
const SONG_KEY =
  /^[A-G][♯♭]{0,2} (major|minor|dorian|phrygian|lydian|mixolydian|locrian|harmonic minor|phrygian dominant)$/;
/** A box label carrying a letter name after its numeral: "…: V7, D7" (then ", given" / ", right"). */
const NAMED_BOX = /: [^,]+, [A-G][♯♭]{0,2}[^,]*(, given)?(, (right|wrong))?$/;

/** The mode words `songKeyLabel` prints, back to the id the index stores. */
const MODE_OF_WORDS: Record<string, HookpadMode> = {
  major: "major",
  minor: "minor",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  locrian: "locrian",
  "harmonic minor": "harmonicMinor",
  "phrygian dominant": "phrygianDominant",
};

/**
 * The song card's key tag, read back into the key it names. Throws rather than
 * guessing: a tag this cannot read means the app printed something else, which
 * is the failure to see.
 */
function parseKeyTag(text: string): { tonic: string; mode: HookpadMode } {
  const at = text.indexOf(" ");
  const tonic = text.slice(0, at).replace(/♯/g, "#").replace(/♭/g, "b");
  const mode = MODE_OF_WORDS[text.slice(at + 1)];
  if (at === -1 || mode === undefined) {
    throw new Error(`The song card's key tag reads ${JSON.stringify(text)}`);
  }
  return { tonic, mode };
}

/** Which reveal value the switch is on, so the run can put it back. */
async function revealMode(page: Page): Promise<string | null> {
  const on = page.locator('[role="radio"][aria-checked="true"]');
  for (const chip of await on.all()) {
    const label = (await chip.innerText()).trim();
    if (label === "Off" || label === "Names" || label === "Keyboard") {
      return label;
    }
  }
  return null;
}

/** The chords the learner has right now: the palette the progress is read for. */
async function readCurriculum() {
  const res = await agentFetch("/api/resources/chord.curriculum");
  if (!res.ok) {
    throw new Error(`GET /api/resources/chord.curriculum → HTTP ${res.status}`);
  }
  const { value } = z.object({ value: z.unknown() }).parse(await res.json());
  return CurriculumSchema.parse(value);
}

const curriculum = await readCurriculum();
const progressParams = encodeProgressParams({
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  tokens: curriculum.unlocked.map((u) => u.token),
});

async function readProgress(): Promise<ChordProgress> {
  const query = new URLSearchParams(progressParams).toString();
  const res = await agentFetch(`/api/resources/chord.progress?${query}`);
  if (!res.ok) {
    throw new Error(`GET /api/resources/chord.progress → HTTP ${res.status}`);
  }
  const { value } = z.object({ value: z.unknown() }).parse(await res.json());
  return ChordProgressSchema.parse(value);
}

// ── 1. the index ─────────────────────────────────────────────────────────────

await ensureReady(r, timeoutMs);
const before = await readProgress();
r.note(
  `progress before: all time ${before.allTime.songs} songs, ${before.allTime.answers} answers; today ${before.today.songs} songs`,
);

await withBrowser(async ({ session }) => {
  const { page, captured } = await session({
    viewport: { width: 1320, height: 900 },
  });

  // ── 2. a round ─────────────────────────────────────────────────────────────

  await boot(page, pathUrl("/chord"), { marker: BOX, timeoutMs });
  const heading = page.locator(HEADING).first();
  const countBoxes = async () => page.locator(ASKED_BOX).count();
  const boxes = await countBoxes();
  const allBoxes = await page.locator(BOX).count();
  const headingText = (await heading.innerText()).replace(/\s+/g, " ");
  r.note(
    `first round: ${boxes} of ${allBoxes} boxes asked, heading "${headingText}"`,
  );
  r.ok("the round asks for at least one box", boxes > 0, String(boxes));
  r.ok(
    "the heading counts the asked boxes only",
    headingText === `Chord 1 of ${boxes}`,
    headingText,
  );

  // ── 3. play, and the player's report ───────────────────────────────────────

  const playback = page.waitForResponse(
    (res) =>
      /\/api\/chord\/videos\/[^/]+\/playback$/.test(
        new URL(res.url()).pathname,
      ) && res.request().method() === "POST",
    { timeout: 90_000 },
  );
  const play = page.locator('button[aria-label="Play"]:not([disabled])');
  await play.waitFor({ state: "visible", timeout: 60_000 });
  await play.click();
  const reportRes = await playback.then(
    (res) => res,
    (err: unknown) => {
      if (err instanceof Error && err.name === "TimeoutError") return null;
      throw err;
    },
  );
  if (reportRes === null) {
    r.fail(
      "the player reports the video (playing or an error) within 90 s",
      "no POST /api/chord/videos/:id/playback — the video neither played nor failed",
    );
  } else {
    const body = z
      .union([
        z.object({ outcome: z.literal("playing") }),
        z.object({ outcome: z.literal("error"), code: z.number() }),
      ])
      .parse(reportRes.request().postDataJSON());
    const answer = z
      .object({ status: VideoStatusSchema })
      .parse(await reportRes.json());
    r.note(
      `playback report: ${reportRes.url()} ${JSON.stringify(body)} → ${JSON.stringify(answer)}`,
    );
    r.ok(
      "the playback report lands",
      reportRes.ok(),
      String(reportRes.status()),
    );
    if (body.outcome === "playing") {
      r.ok(
        "a playing video resolves ok",
        answer.status === "ok",
        answer.status,
      );
    }
  }

  // An error moves the trainer on; wait for the round on screen to settle.
  await page
    .locator(BOX)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1_000);

  // ── 4. fill every asked box from the keyboard ─────────────────────────────

  const total = await countBoxes();
  // Only the digits that answer on their own: a digit several chords share
  // arms a second keystroke, which this script has no reason to exercise.
  const soloKeys = chordKeyPlan(curriculum.unlocked.map((u) => u.token))
    .filter((group) => group.tokens.length === 1)
    .map((group) => group.digit);
  const keys = soloKeys.length > 0 ? soloKeys : ["1"];
  const rounds = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/chord/rounds" &&
      res.request().method() === "POST",
    { timeout: 30_000 },
  );
  for (let i = 0; i < total; i++) {
    await page.keyboard.press(keys[i % keys.length] ?? "1");
  }
  const roundRes = await rounds;
  const saved = z.object({ roundId: z.string() }).parse(await roundRes.json());
  r.ok("the round is saved", roundRes.ok(), String(roundRes.status()));
  r.note(`round ${saved.roundId}: ${total} answers`);

  const checked = (await heading.innerText()).replace(/\s+/g, " ");
  r.ok(
    "the heading shows the score",
    new RegExp(`^\\d+ of ${String(total)} right in \\d+\\.\\d s$`).test(
      checked,
    ),
    checked,
  );
  const marks = await page
    .locator(`${BOX}[aria-label$=", right"], ${BOX}[aria-label$=", wrong"]`)
    .count();
  r.eq("every box is marked right or wrong", marks, total);

  // ── 5. the progress moves ──────────────────────────────────────────────────

  const after = await waitFor(
    readProgress,
    (p) => p.allTime.songs === before.allTime.songs + 1,
    { timeoutMs: 20_000, intervalMs: 500 },
  );
  r.ok(
    "chord.progress counts one more song",
    after.ok,
    JSON.stringify(after.value.allTime),
  );
  r.eq(
    "chord.progress counts one more answer per box",
    after.value.allTime.answers,
    before.allTime.answers + total,
  );
  r.eq(
    "today counts one more song",
    after.value.today.songs,
    before.today.songs + 1,
  );
  const songs = before.allTime.songs + 1;
  const panelLine = page.getByText(
    `All time: ${String(songs)} ${songs === 1 ? "song" : "songs"},`,
  );
  const shown = await panelLine
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(
      () => true,
      (err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") return false;
        throw err;
      },
    );
  r.ok("the side panel shows the new song count", shown);

  // ── 6. reveal: the names, and the keyboard's notes ────────────────────────
  //
  // The switch is turned to Keyboard and back, so the setting is left as it was
  // found. The keyboard check is the end-to-end proof that the picture matches
  // the sound: the lit keys are read off the DOM and compared with
  // `chordVoicing` computed HERE, from the key the song card names and the
  // chord the button stands for — the same call the trainer's piano plays.
  // Clicking a chord button after the check also plays that chord, so this step
  // exercises the piano; a failure there surfaces as a page error below.

  const wasRevealed = await revealMode(page);
  r.note(`reveal was "${wasRevealed ?? "?"}"`);
  await page.getByRole("radio", { name: "Keyboard", exact: true }).click();

  const keyTag = page.getByText(SONG_KEY).first();
  const keyShown = await keyTag
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(
      () => true,
      (err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") return false;
        throw err;
      },
    );
  r.ok("the song card names the key", keyShown);

  if (keyShown) {
    const keyText = (await keyTag.innerText()).trim();
    const songKey = parseKeyTag(keyText);
    r.note(`key tag "${keyText}" → ${JSON.stringify(songKey)}`);

    // Every box now carries a letter name after its numeral.
    const labels = await page
      .locator(BOX)
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("aria-label") ?? ""),
      );
    const named = labels.filter((label) => NAMED_BOX.test(label));
    r.eq("every box names its chord", named.length, labels.length);
    r.note(`box labels: ${labels.join(" | ")}`);

    // A chord button whose digit answers on its own, so one click is one chord
    // and the token behind it is not in doubt.
    const solo = chordKeyPlan(curriculum.unlocked.map((u) => u.token)).find(
      (group) => group.tokens.length === 1,
    );
    const token = solo?.tokens[0];
    if (solo === undefined || token === undefined) {
      r.note("no chord answers on a digit of its own — keyboard check skipped");
    } else {
      await page.locator(`button[aria-keyshortcuts="${solo.digit}"]`).click();
      const keys = page.locator("[data-pitch]:has(.chord-key-label)");
      await keys
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "TimeoutError") return;
          throw err;
        });
      const litPitches = (
        await keys.evaluateAll((nodes) =>
          nodes.map((n) => Number(n.getAttribute("data-pitch"))),
        )
      ).sort((a, b) => a - b);
      const voicing = [
        ...chordVoicing(token, hookpadTonicPc(songKey.tonic)),
      ].sort((a, b) => a - b);
      r.eq(
        `the keyboard lights the notes the piano plays for ${chordLabel(token).text}`,
        litPitches,
        voicing,
      );
      const names = await keys.locator(".chord-key-label").allInnerTexts();
      r.eq("every lit key is named", names.length, voicing.length);
      r.note(`lit ${litPitches.join(",")} named ${names.join(",")}`);
    }
  }

  // Put the setting back where it was found.
  if (wasRevealed !== null) {
    await page.getByRole("radio", { name: wasRevealed, exact: true }).click();
  }

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("\n"),
  );
});

await r.finish();
