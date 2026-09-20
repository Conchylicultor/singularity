// Photographs the reveal card with a chord actually LIT, which is the one
// thing `trainer/e2e/trainer-verify.ts` cannot tell you: it checks that the
// right keys light, not that the lit key reads against the ones beside it.
//
// The keyboard lights nothing until the round is checked (that is what stops it
// giving the answer away), so this fills the round first, then clicks a chord.
//
// Usage:
//   ./singularity run plugins/apps/plugins/chord/plugins/reveal/e2e/reveal-shot.ts [--out /tmp/reveal] [--headed]
//
// Mutates server state: turns reveal to Keyboard (and back), and records one
// checked round, like any trainer run.

import {
  agentFetch,
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { chordKeyPlan } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { CurriculumSchema } from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import { ensureReady } from "@plugins/apps/plugins/chord/plugins/song-index/e2e";
import { z } from "zod";

const r = report("chord reveal — a lit chord");
const out = arg("out") ?? "/tmp/reveal-lit";

/** An answer box, asked or given. */
const BOX = 'button[aria-label^="Chord "][aria-label*=" beat"]';
const ASKED_BOX = `${BOX}:not([aria-label*=", given"])`;

const res = await agentFetch("/api/resources/chord.curriculum");
if (!res.ok) throw new Error(`chord.curriculum → HTTP ${res.status}`);
const { value } = z.object({ value: z.unknown() }).parse(await res.json());
const curriculum = CurriculumSchema.parse(value);

// The digits that answer on their own: one press is one chord, and the chord
// behind the press is not in doubt.
const solo = chordKeyPlan(curriculum.unlocked.map((u) => u.token)).filter(
  (group) => group.tokens.length === 1,
);
const first = solo[0];
if (first === undefined) {
  throw new Error("No chord answers on a digit of its own — nothing to click");
}

await ensureReady(r, 10 * 60_000);

await withBrowser(async ({ session }) => {
  const { page, captured } = await session({
    viewport: { width: 1320, height: 900 },
  });
  await boot(page, pathUrl("/chord"), { marker: BOX, timeoutMs: 120_000 });

  const wasOn = await page
    .locator('[role="radio"][aria-checked="true"]')
    .first()
    .innerText();
  await page.getByRole("radio", { name: "Keyboard", exact: true }).click();

  // Fill every asked box, which checks the round.
  const asked = await page.locator(ASKED_BOX).count();
  for (let i = 0; i < asked; i++) {
    await page.keyboard.press(first.digit);
  }
  await page
    .locator(`${BOX}[aria-label$=", right"], ${BOX}[aria-label$=", wrong"]`)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });

  // A chord button after the check plays that chord and lights its notes.
  await page.locator(`button[aria-keyshortcuts="${first.digit}"]`).click();
  const lit = page.locator("[data-pitch]:has(.chord-key-label)");
  await lit.first().waitFor({ state: "visible", timeout: 10_000 });
  r.note(`lit ${String(await lit.count())} keys`);

  const shot = await snap(page, out, "lit");
  r.ok("the shot was taken", shot.ok, shot.path);

  await page.getByRole("radio", { name: wasOn.trim(), exact: true }).click();
  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("\n"),
  );
});

await r.finish();
