// Inline `@` date-mention UX verification
// (research/2026-08-03-global-date-picker-primitive-and-inline-date-ux.md).
//
// Covers the three complaints the change exists to fix, end to end in the real
// app. The unit suite (`web/internal/date-options.test.ts`) already pins
// `buildMenu`'s model; what it CANNOT see is whether the menu actually renders
// those rows, whether Enter commits the highlighted one, and whether the chip is
// reachable at all — every one of which lives in Lexical + the caret-trigger
// surface, not in the pure function.
//
// Phases:
//  1. `@tod` — the row list is non-empty and its FIRST row reads "Today". This
//     is the primary fix: before, a prefix query fell into the hint state with
//     zero rows, so there was nothing to press Enter on.
//  2. the grammar footer is present in BOTH states — with rows (`@tod`) and in
//     the hint state (`@nex`, which resolves nothing but still looks like a
//     date). Discoverability was the second complaint.
//  3. `@today` + Enter commits a chip, and exactly ONE date row was offered
//     (the parsed row and the `Today` preset are the same day — deduped).
//  4. the committed chip opens the picker, showing the month grid, the relative
//     presets, and the reminder toggle.
//
// Usage: bun plugins/page/plugins/inline-date/e2e/date-menu-verify.ts [--base <url>] [--out /tmp/date-menu] [--headed]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";
import type { Locator, Page } from "playwright";

const base = baseUrl();
const out = arg("out", "/tmp/date-menu");

const r = report("inline-date @ menu");

/**
 * The caret menu's panel. `FloatingSurface` is a `ViewportOverlay` (a body-
 * portaled `fixed inset-0 z-popover` layer) wrapping a `Surface level="overlay"`
 * — neither carries a `data-slot`, so the z-layer + surface tone is the stable
 * handle. Scoping to `.z-popover` also keeps this from matching the CHIP's
 * base-ui popover, which shares `bg-popover` but is not in the overlay layer.
 */
function surface(page: Page): Locator {
  return page.locator("div.z-popover div.bg-popover");
}

/**
 * The caret menu's rows. They are plain `<div>`s — no `role="button"` — because
 * `Row` infers its element from `href`/`onClick` and these commit on
 * `onPointerDown`. A `getByRole("button")` probe finds nothing, which is the
 * same hazard `caret-trigger`'s own e2e documents inline. `region-line` is the
 * single-line container class every `Row` carries.
 */
function menuRows(page: Page): Locator {
  return surface(page).locator("div.region-line");
}

/** Type `@…` into the focused block and let the menu derive itself. */
async function typeQuery(page: Page, block: Locator, query: string): Promise<void> {
  await block.click();
  await page.keyboard.type(query, { delay: 25 });
  // Open-state is derived inside Lexical's update listener; the surface is
  // caret-anchored and positions on a later tick.
  await page.waitForTimeout(300);
}

/** Clear the block back to empty so the next phase starts from a clean slate. */
async function clearBlock(page: Page, block: Locator): Promise<void> {
  await block.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  // Backspacing a block to empty can remount it and drop focus, and `open` is
  // focus-gated — so re-focus before the next query or every later assertion
  // fails for the wrong reason.
  await block.click();
  await page.waitForTimeout(200);
}

await withBrowser(async (h) => {
  const { page } = await h.session();
  const { block, pageUrl } = await openBlankPage(page, base, { settleMs: 3000 });
  console.log("page url:", pageUrl);

  // ── 1. a prefix query keeps the preset pressable ───────────────────────────
  await typeQuery(page, block, "@tod");
  await snap(page, out, "tod");

  const rows = await menuRows(page).allInnerTexts();
  r.ok(
    "@tod offers at least one row (not the dead hint state)",
    rows.length > 0,
    JSON.stringify(rows),
  );
  r.ok(
    "@tod's first row reads Today",
    rows[0]?.includes("Today") === true,
    `first row: ${rows[0] ?? "<none>"}`,
  );

  // ── 2. the grammar footer is visible in both states ────────────────────────
  const withRows = await surface(page).innerText();
  r.ok(
    "the format footer is shown alongside rows",
    withRows.includes("tomorrow") && withRows.includes("jun 17"),
    withRows,
  );

  await clearBlock(page, block);
  await typeQuery(page, block, "@nex");
  await snap(page, out, "hint");
  const hintOnly = await surface(page).innerText();
  r.ok(
    "the format footer is shown in the hint state too",
    hintOnly.includes("tomorrow") && hintOnly.includes("jun 17"),
    hintOnly,
  );

  // ── 3. @today commits, and offered exactly one date row ────────────────────
  await clearBlock(page, block);
  await typeQuery(page, block, "@today");
  const todayRows = await menuRows(page).allInnerTexts();
  const dateRows = todayRows.filter((t) => !t.includes("Remind me"));
  r.ok(
    "@today offers exactly one date row (preset deduped against the parse)",
    dateRows.length === 1,
    JSON.stringify(todayRows),
  );
  r.ok(
    "@today's date row reads Today",
    dateRows[0]?.includes("Today") === true,
    `date row: ${dateRows[0] ?? "<none>"}`,
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await snap(page, out, "committed");

  // ── 4. the chip opens the picker ───────────────────────────────────────────
  const chip = page
    .locator("[data-block-id] button")
    .filter({ hasText: /\w+, \w+ \d+/ })
    .first();
  const chipCount = await chip.count();
  r.ok("a date chip was inserted", chipCount > 0, `chip count: ${chipCount}`);

  if (chipCount > 0) {
    await chip.click();
    await page.waitForTimeout(500);
    await snap(page, out, "picker");

    const panel = await page.locator('[data-slot="popover-content"]').innerText();
    r.ok(
      "the picker shows the relative presets",
      panel.includes("Today") &&
        panel.includes("Tomorrow") &&
        panel.includes("Yesterday"),
      panel,
    );
    r.ok(
      "the picker shows a month grid and the reminder toggle",
      /\bSun\b/.test(panel) && panel.includes("Remind me"),
      panel,
    );
  } else {
    r.fail("picker assertions skipped — no chip to click");
  }
});

r.finish();
