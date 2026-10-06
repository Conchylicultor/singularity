// The collapsed floating bar's mark: the health dot, ringed while a background
// activity runs (`ActionBar.Activity`), with glance chips (`ActionBar.Glance`,
// e.g. Reload) beside it that hide while the bar is open.
//
// Opens the app, switches to Fullscreen (solo) so the bar floats collapsed, and
// photographs the mark at rest. With `--wait-ring <s>` it then waits that long
// for a ring to appear (start a build in parallel) and photographs it. Last it
// hovers the bar open and checks no glance chip is visible while it is.
// Writes `<out>-rest.png`, `<out>-ring.png`, `<out>-open.png` (cropped to the
// bar's corner).
//
// Usage:
//   ./singularity run plugins/shell/plugins/global-action-bar/e2e/collapsed-mark.ts \
//     [--path /agents] [--out /tmp/collapsed-mark] [--wait-ring 600]

import {
  arg,
  pageUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";

const out = arg("out") ?? "/tmp/collapsed-mark";
const waitRing = Number(arg("wait-ring") ?? "0");
const url = pageUrl();

const health = (page: Page) => page.locator("[data-health]").last();

/** The top-right corner the floating bar lives in. */
async function corner(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 1400;
  await page.screenshot({
    path: `${out}-${name}.png`,
    clip: { x: width - 420, y: 0, width: 420, height: 64 },
  });
  console.log(`wrote ${out}-${name}.png`);
}

await withBrowser(async (h) => {
  const t = report("collapsed mark");
  const { page } = await h.session({ viewport: { width: 1400, height: 900 } });
  await page.goto(url);
  const gear = page
    .getByRole("button", { name: "View options", exact: true })
    .first();
  await gear.waitFor();
  await gear.click();
  await page
    .getByRole("radio", { name: "Fullscreen (solo)", exact: true })
    .click();
  await page.mouse.click(700, 600); // dismiss the popover; rest the bar collapsed
  await page.mouse.move(10, 450);
  await page.waitForTimeout(1200);

  t.note(`health button: ${await health(page).getAttribute("aria-label")}`);
  await corner(page, "rest");

  if (waitRing > 0) {
    const ring = health(page).locator("svg circle").first();
    const appeared = await ring
      .waitFor({ state: "attached", timeout: waitRing * 1000 })
      .then(() => true)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") return false;
        throw err;
      });
    t.ok("a ring appears while an activity runs", appeared);
    if (appeared) {
      await page.waitForTimeout(400);
      t.note(`ringed: ${await health(page).getAttribute("aria-label")}`);
      await corner(page, "ring");
    }
  }

  // Open the bar: the glance chips must hide (the row carries the same actions).
  // A real pointer move, not locator.hover(): the floating panel's own layer
  // sits over the trigger and would make hover() wait forever.
  const box = await health(page).boundingBox();
  if (!box) throw new Error("health button has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const visibleGlance = await page
    .locator(".group-data-open\\/fa\\:hidden")
    .evaluateAll((els) =>
      // The wrapper is `display: contents` (no box of its own): measure its chips.
      els.some((el) =>
        [...el.children].some((c) => c.getBoundingClientRect().width > 0),
      ),
    );
  t.ok("open: no glance chip is visible", !visibleGlance);
  await corner(page, "open");
  await t.finish();
});
