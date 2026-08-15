// The month grid's ARIA structure, roving tab stop, keyboard navigation and
// column alignment, in a real browser.
//
// The jsdom suite already pins the roles, the counts and the focus moves. What
// it CANNOT see is the one thing this script exists for: the month is SEVEN
// separate `<Grid cols={7}>` rows (a weekday header plus six weeks), not one
// flat 42-cell grid, and jsdom has no layout engine — every `getBoundingClientRect`
// there is a zero rect. So "do the columns still line up across seven
// independent grids?" is a question only a real engine can answer.
//
// Phases:
//  1. reach a live `<Calendar>` — the page editor's `@` date chip opens a
//     `DatePickerPanel`, which is the shortest reliable path to one.
//  2. structure: exactly one `role="grid"`, 7 `role="row"`, 7
//     `role="columnheader"`, 42 `role="gridcell"`, and exactly ONE day button
//     with `tabindex="0"`.
//  3. `ArrowRight` moves focus one day forward (compared by `data-day`, and
//     against the day the local calendar says follows it).
//  4. `PageDown` pages the month: the title changes AND focus is still on a day
//     button — the layout effect really did re-find the button after the whole
//     grid re-rendered.
//  5. alignment: every row's seven cells share the previous row's column lefts
//     and widths, within 1px.
//
// Usage: bun plugins/primitives/plugins/date-picker/e2e/calendar-keyboard.ts [--base <url>] [--out /tmp/calendar-kb] [--headed]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";
import type { Locator, Page } from "playwright";

import { addDays, fromISODay, toISODay } from "../core";

const base = baseUrl();
const out = arg("out", "/tmp/calendar-kb");

const r = report("date-picker calendar keyboard + alignment");

/** The panel the date chip opens. `DatePickerPopover` is an `InlinePopover`. */
function panel(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]');
}

/** The month grid inside it. */
function grid(page: Page): Locator {
  return panel(page).locator('[role="grid"]');
}

/** The `data-day` of whatever currently has DOM focus, or null if it is not a day. */
function focusedDay(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-day") ?? null,
  );
}

/** The grid's accessible name — i.e. the rendered month title it points at. */
function monthTitleText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const g = document.querySelector(
      '[data-slot="popover-content"] [role="grid"]',
    );
    const id = g?.getAttribute("aria-labelledby");
    if (!id) return null;
    return document.getElementById(id)?.textContent ?? null;
  });
}

interface RowGeometry {
  lefts: number[];
  widths: number[];
}

/** Each `role="row"`'s seven cell rects, in document order. */
function rowGeometry(page: Page): Promise<RowGeometry[]> {
  return page.evaluate(() => {
    const g = document.querySelector(
      '[data-slot="popover-content"] [role="grid"]',
    );
    if (!g) return [];
    return [...g.querySelectorAll('[role="row"]')].map((row) => {
      const cells = [
        ...row.querySelectorAll('[role="columnheader"], [role="gridcell"]'),
      ];
      return {
        lefts: cells.map((c) => c.getBoundingClientRect().left),
        widths: cells.map((c) => c.getBoundingClientRect().width),
      };
    });
  });
}

await withBrowser(async (h) => {
  const { page, captured } = await h.session();

  // ── 1. reach a live Calendar ───────────────────────────────────────────────
  const { block, pageUrl } = await openBlankPage(page, base, {
    settleMs: 3000,
  });
  console.log("page url:", pageUrl);

  await block.click();
  await page.keyboard.type("@today", { delay: 25 });
  // The caret menu derives its open state inside Lexical's update listener and
  // positions on a later tick.
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);

  const chip = page
    .locator("[data-block-id] button")
    .filter({ hasText: /\w+, \w+ \d+/ })
    .first();
  const chipCount = await chip.count();
  r.ok("a date chip was committed", chipCount > 0, `chip count: ${chipCount}`);
  if (chipCount === 0) {
    await snap(page, out, "no-chip");
    // Throw rather than `finish()` here: `finish()` calls `process.exit`, which
    // would skip `withBrowser`'s `finally` and leak the chromium process.
    throw new Error(
      "no date chip was committed — the calendar was never reached",
    );
  }

  await chip.click();
  await grid(page).waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(300);
  await snap(page, out, "before");

  // ── 2. the grid's structure ────────────────────────────────────────────────
  r.eq("exactly one role=grid", await grid(page).count(), 1);
  r.eq(
    "7 role=row (weekday header + 6 weeks)",
    await grid(page).locator('[role="row"]').count(),
    7,
  );
  r.eq(
    "7 role=columnheader",
    await grid(page).locator('[role="columnheader"]').count(),
    7,
  );
  r.eq(
    "42 role=gridcell",
    await grid(page).locator('[role="gridcell"]').count(),
    42,
  );

  const tabStops = grid(page).locator('button[data-day][tabindex="0"]');
  const tabStopCount = await tabStops.count();
  r.eq("exactly one day button with tabindex=0", tabStopCount, 1);
  if (tabStopCount !== 1) {
    await snap(page, out, "tabstop-broken");
    throw new Error(
      `expected exactly one day button with tabindex=0, found ${tabStopCount}`,
    );
  }

  // ── 3. ArrowRight moves one day forward ────────────────────────────────────
  const startIso = await tabStops.first().getAttribute("data-day");
  r.ok(
    "the tab stop carries a data-day",
    startIso !== null,
    `got ${String(startIso)}`,
  );
  if (startIso === null)
    throw new Error("the tab stop has no data-day attribute");

  await tabStops.first().focus();
  r.eq(
    "focusing the tab stop puts DOM focus on it",
    await focusedDay(page),
    startIso,
  );

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const afterRight = await focusedDay(page);
  const startDate = fromISODay(startIso);
  if (startDate === null) {
    throw new Error(
      `the tab stop's data-day is not a calendar day: ${startIso}`,
    );
  }
  const expectedRight = toISODay(addDays(startDate, 1));
  r.ok(
    "ArrowRight moved focus off the starting day",
    afterRight !== null && afterRight !== startIso,
    `from ${startIso} to ${String(afterRight)}`,
  );
  r.eq("ArrowRight lands on the next calendar day", afterRight, expectedRight);

  // ── 4. PageDown pages the month, keeping focus on a day ────────────────────
  const titleBefore = await monthTitleText(page);
  r.ok(
    "the grid is labelled by a month title",
    titleBefore !== null,
    String(titleBefore),
  );

  await page.keyboard.press("PageDown");
  await page.waitForTimeout(300);

  const titleAfter = await monthTitleText(page);
  const focusAfterPage = await focusedDay(page);
  r.ok(
    "PageDown changed the month title",
    titleAfter !== null && titleAfter !== titleBefore,
    `before ${String(titleBefore)} after ${String(titleAfter)}`,
  );
  r.ok(
    "PageDown left focus on a day button",
    focusAfterPage !== null,
    `activeElement data-day: ${String(focusAfterPage)}`,
  );
  r.eq(
    "the paged grid still has exactly one tabindex=0 day",
    await grid(page).locator('button[data-day][tabindex="0"]').count(),
    1,
  );
  r.eq(
    "the paged grid still has 42 gridcells",
    await grid(page).locator('[role="gridcell"]').count(),
    42,
  );
  await snap(page, out, "after");

  // ── 5. the seven independent grids share their columns ─────────────────────
  const rows = await rowGeometry(page);
  r.eq("geometry read back 7 rows", rows.length, 7);
  r.ok(
    "every row has 7 cells",
    rows.every((row) => row.lefts.length === 7),
    JSON.stringify(rows.map((row) => row.lefts.length)),
  );

  if (rows.length === 7 && rows.every((row) => row.lefts.length === 7)) {
    const first = rows[0]!;
    const second = rows[1]!;
    // Printed unconditionally: an alignment check that only speaks up on
    // failure is indistinguishable from one measuring seven zero rects.
    for (const [i, row] of rows.entries()) {
      r.note(
        `row ${i} lefts ${row.lefts.map((n) => n.toFixed(1)).join(" ")}` +
          ` | widths ${row.widths.map((n) => n.toFixed(1)).join(" ")}`,
      );
    }
    const misfits: string[] = [];
    for (let col = 0; col < 7; col++) {
      const drift = Math.abs(first.lefts[col]! - second.lefts[col]!);
      if (drift > 1) misfits.push(`col ${col}: ${drift.toFixed(3)}px`);
    }
    r.ok(
      "week rows 1 and 2 share column lefts within 1px",
      misfits.length === 0,
      `drift — ${misfits.join(", ")}\nrow1 ${JSON.stringify(first.lefts)}\nrow2 ${JSON.stringify(second.lefts)}`,
    );

    // The same check across ALL seven rows (weekday header included): each row
    // is its own grid, so any one of them could be the odd one out.
    const allDrift: string[] = [];
    for (let row = 1; row < rows.length; row++) {
      for (let col = 0; col < 7; col++) {
        const dl = Math.abs(rows[row]!.lefts[col]! - first.lefts[col]!);
        const dw = Math.abs(rows[row]!.widths[col]! - first.widths[col]!);
        if (dl > 1)
          allDrift.push(`row ${row} col ${col} left ${dl.toFixed(3)}px`);
        if (dw > 1)
          allDrift.push(`row ${row} col ${col} width ${dw.toFixed(3)}px`);
      }
    }
    r.ok(
      "all 7 rows share the header row's column lefts and widths within 1px",
      allDrift.length === 0,
      allDrift.join(", "),
    );

    // A degenerate grid (every cell at left 0, or zero-width) would satisfy the
    // alignment check vacuously, so pin that the columns are genuinely distinct.
    const spread = first.lefts[6]! - first.lefts[0]!;
    r.ok(
      "the seven columns are genuinely laid out side by side",
      spread > 50 && first.widths.every((w) => w > 4),
      `lefts ${JSON.stringify(first.lefts)} widths ${JSON.stringify(first.widths)}`,
    );
  } else {
    r.fail("alignment assertions skipped — row/cell geometry was not 7×7");
  }

  r.ok(
    "no page errors during the run",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
});

r.finish();
