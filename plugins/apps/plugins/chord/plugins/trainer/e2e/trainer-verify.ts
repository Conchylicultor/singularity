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
//      time — and the side panel shows the new song count.
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
import { chordKeyPlan } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { VideoStatusSchema } from "@plugins/apps/plugins/chord/plugins/video-availability/core";
import { z } from "zod";

const r = report("chord trainer");
const timeoutMs = numArg("timeout-min", 15) * 60_000;

/** An answer box: "Chord 2, 4 beats" (plus ": IV", ", given", ", right"…). */
const BOX = 'button[aria-label^="Chord "][aria-label*=" beat"]';
/** The boxes the round actually asks about — the given ones name themselves. */
const ASKED_BOX = `${BOX}:not([aria-label*=", given"])`;
const HEADING = "h2";

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

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("\n"),
  );
});

await r.finish();
