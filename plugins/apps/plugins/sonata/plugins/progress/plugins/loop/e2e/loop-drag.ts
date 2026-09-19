// Verifies the A–B loop's bounds can be dragged on both surfaces:
//   - on the progression bar, dragging the B handle past the right edge puts B
//     at the very end of the song (it used to stop at the last bar line), and
//     does not drag the playhead along with it;
//   - on the piano roll, dragging the A boundary line moves A (the bar's A
//     handle follows) without also scrubbing the song.
//
// The loop lives only in the page's memory, so nothing is left behind.
//
// Usage:
//   ./singularity run plugins/apps/plugins/sonata/plugins/progress/plugins/loop/e2e/loop-drag.ts \
//     --song <songId> [--url http://<namespace>.localhost:9000] [--headed]

import {
  pathUrl,
  report,
  requireArg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const songId = requireArg(
  "song",
  "usage: loop-drag.ts --song <songId> [--url …] [--headed]",
);
const OUT = "/tmp/sonata-loop-drag";

await withBrowser(async (h) => {
  const { page } = await h.session({ colorScheme: "dark" });
  const r = report("sonata loop drag");

  const slider = page.getByRole("slider", { name: "Song position" });
  await page.goto(pathUrl(`/sonata/song/${songId}`));
  await slider.waitFor({ timeout: 90_000 });
  // Opening a song clears any loop, so create it only once the roll is up.
  await page.locator("canvas").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Loop", exact: true }).click();

  const barStart = page.locator('[aria-label="Loop start"]');
  const barEnd = page.locator('[aria-label="Loop end"]');
  const rollStart = page.locator('[aria-label="Loop start (A)"]');
  await barEnd.waitFor();
  await rollStart.waitFor();
  await snap(page, OUT, "1-loop-created");

  const centerX = async (l: typeof barEnd) => {
    const b = await l.boundingBox();
    if (!b) throw new Error("handle has no box");
    return b.x + b.width / 2;
  };
  const track = await slider.boundingBox();
  if (!track) throw new Error("slider has no box");

  // ── Progression bar: drag B past the right edge ──────────────────────────
  const positionBefore = await slider.getAttribute("aria-valuenow");
  const bBox = await barEnd.boundingBox();
  if (!bBox) throw new Error("the bar's B handle has no box");
  const bx = bBox.x + bBox.width / 2;
  const by = bBox.y + bBox.height / 2;
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width + 40, by, { steps: 12 });
  await page.mouse.up();
  const endX = await centerX(barEnd);
  r.ok(
    "B dragged past the edge lands on the end of the song",
    Math.abs(endX - (track.x + track.width)) <= 1.5,
    `B at ${endX.toFixed(1)}, track ends at ${(track.x + track.width).toFixed(1)}`,
  );
  r.eq(
    "dragging B did not move the playhead",
    await slider.getAttribute("aria-valuenow"),
    positionBefore,
  );
  await snap(page, OUT, "2-b-at-end");

  // ── Piano roll: drag the A line upward ──────────────────────────────────
  const aBefore = await centerX(barStart);
  const valueBefore = await slider.getAttribute("aria-valuenow");
  const a = await rollStart.boundingBox();
  if (!a) throw new Error("the roll's A line has no box");
  r.note(`roll A line at y=${a.y.toFixed(1)}`);
  // The top of the strip: with the playhead on A, the line sits on the lane's
  // bottom edge and the strip's lower half is under the keyboard.
  const ax = a.x + a.width / 3;
  const ay = a.y + 3;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move(ax, ay - 250, { steps: 12 });
  await page.mouse.up();
  const aAfter = await centerX(barStart);
  r.ok(
    "dragging the roll's A line moves A later",
    aAfter > aBefore + 1,
    `A on the bar was ${aBefore.toFixed(1)}, now ${aAfter.toFixed(1)}`,
  );
  r.eq(
    "the drag did not scrub the song",
    await slider.getAttribute("aria-valuenow"),
    valueBefore,
  );
  await snap(page, OUT, "3-a-moved");

  await r.finish();
});
