// Opens a chord-grid song from the library, switches the player to the
// "Chord grid" display and photographs it — at rest, after clicking a chord
// (which must seek there), and with the side pane's "Chord list" card.
//
// Usage:
//   ./singularity run plugins/apps/plugins/sonata/plugins/chord-chart/e2e/chord-chart-verify.ts \
//     [--song "Blues"] [--color-scheme dark|light] [--out /tmp/chord-chart] [--headed]

import {
  arg,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const SONG = arg("song", "Blues");
const SCHEME = arg("color-scheme", "dark") === "light" ? "light" : "dark";
const OUT = arg("out", "/tmp/chord-chart");

await withBrowser(async (h) => {
  const { page } = await h.session({
    colorScheme: SCHEME,
    viewport: { width: 1440, height: 900 },
  });
  const r = report(`sonata chord grid (${SONG}, ${SCHEME})`);

  await page.goto(pathUrl("/sonata"));
  await page.getByText(SONG, { exact: true }).first().click();
  await page.waitForTimeout(4000);

  await page.getByRole("button", { name: "Chord grid" }).first().click();
  await page.waitForTimeout(2000);

  const bars = page.locator(".chord-chart-bar");
  r.ok("the chord grid shows bars", (await bars.count()) > 0);
  await snap(page, OUT, "1-grid");

  // Clicking a struck chord seeks there: its bar becomes the active one.
  const target = bars.nth(Math.min(2, (await bars.count()) - 1));
  await target.locator(".chord-box-hit").first().click();
  await page.waitForTimeout(800);
  r.ok(
    "clicking a chord makes its bar active",
    (await target.getAttribute("data-active")) !== null,
  );
  await snap(page, OUT, "2-seeked");

  // The side pane's sections start collapsed: open the chord list.
  await page.getByRole("button", { name: "Chord list" }).first().click();
  await page.waitForTimeout(800);
  const list = page.locator(".chord-list-row");
  r.ok("the chord list shows rows", (await list.count()) > 0);
  if ((await list.count()) > 0) {
    await list.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await snap(page, OUT, "3-list");
  }

  // A playing frame: the active bar outlined, its chord ringed, the beat line
  // part-way through it, the other bars receded.
  // Space toggles play on the focused player (a click on the sheet's empty
  // area focuses it without activating a chord).
  await page.mouse.click(500, 860);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  r.ok(
    "playing marks the display",
    (await page.locator("[data-playing] .chord-chart-bar").count()) > 0,
  );
  await snap(page, OUT, "4-playing");
  await page.keyboard.press("Space");

  await r.finish();
});
