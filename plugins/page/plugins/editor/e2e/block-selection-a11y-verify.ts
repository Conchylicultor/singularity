// The block list's two ACCESSIBLE selection channels, verified in a real browser.
// See research/2026-08-15-page-block-list-accessible-selection.md and the editor's
// CLAUDE.md, *The block list is a document, not a listbox*.
//
// What is being defended, and why a jsdom test cannot do it alone:
//
//  1. The container tells the truth about what it is. It used to claim
//     `role="listbox" aria-multiselectable` with nothing below it wearing
//     `role="option"` — which announced an empty list AND flattened the whole
//     document (headings, lists, quotes) out of the accessibility tree. Nothing
//     here may reintroduce a `listbox` anywhere on the page.
//  2. Selection is SPOKEN. There is no `aria-selected` to carry it (no role that
//     supports it may host a `contenteditable`), so every range change writes the
//     polite live region, and every selected row carries the visually-hidden word
//     "Selected.".
//
// The two assertions a real browser is needed for: the live regions must be in the
// DOM from first paint — a region mounted in the same commit as its text is
// silently skipped by assistive tech, which is invisible to a component test that
// renders host and message together — and the "don't announce into silence" guard,
// which is a statement about what the region does NOT hold after a second Escape.
//
// Usage: bun plugins/page/plugins/editor/e2e/block-selection-a11y-verify.ts [--base <url>]
import {
  baseUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "./support/blank-page";
import { blockSelectionDriver } from "./support/block-selection";
import { typeLines } from "./support/type-lines";

const base = baseUrl();
const r = report();

/** The polite live region's raw text — trailing space and all (see below). */
const POLITE = '[role="status"][aria-live="polite"][aria-atomic="true"]';
const ASSERTIVE = '[role="alert"][aria-live="assertive"][aria-atomic="true"]';

await withBrowser(async (h) => {
  const { page } = await h.session();

  const count = (selector: string): Promise<number> =>
    page.evaluate((s) => document.querySelectorAll(s).length, selector);

  /**
   * The polite region's text, read RAW.
   *
   * Never trim it: re-announcing an identical string lands as that string plus
   * one trailing space (`announcer-store.ts`'s `nextText`), which is exactly how
   * the "second Escape said nothing" assertion tells silence from a repeat.
   */
  const politeText = (): Promise<string> =>
    page.evaluate(
      (s) => document.querySelector(s)?.textContent ?? "<no region>",
      POLITE,
    );

  /** How many rows carry the per-row `sr-only` marker — the second channel. */
  const markedRows = (): Promise<number> =>
    page.evaluate(
      () =>
        [...document.querySelectorAll("[data-block-id]")].filter((el) =>
          (el.textContent ?? "").includes("Selected."),
        ).length,
    );

  /** Every rendered block row — the `n` the announcements count against. */
  const blockCount = (): Promise<number> =>
    page.evaluate(() => document.querySelectorAll("[data-block-id]").length);

  await openBlankPage(page, base, { settleMs: 3000 });

  // ---- 1. The regions exist BEFORE anything is announced --------------------
  //
  // Read before a single selection keystroke: a live region only speaks a change
  // to text it already had, so arriving with its first message is arriving too
  // late. Both regions must be here, empty, from the app's first paint.
  r.eq("the polite live region is mounted at boot", await count(POLITE), 1);
  r.eq(
    "the assertive live region is mounted at boot",
    await count(ASSERTIVE),
    1,
  );
  r.eq(
    "the polite region is empty before any announcement",
    await politeText(),
    "",
  );

  // Four sibling blocks: alpha / bravo / charlie / delta, plus the trailing empty.
  await typeLines(page, ["alpha", "bravo", "charlie", "delta"], {
    trailingEnter: true,
  });
  await page.waitForTimeout(800);

  const n = await blockCount();
  r.eq("the fixture rendered five block rows", n, 5);

  // ---- 2. The container claims nothing it cannot honor ----------------------
  r.eq(
    "no role=listbox anywhere on the page",
    await count('[role="listbox"]'),
    0,
  );
  r.eq(
    'the block list is role="group" aria-label="Page blocks"',
    await count('[role="group"][aria-label="Page blocks"]'),
    1,
  );

  const driver = blockSelectionDriver(page, r);

  // ---- 3. Entering selection mode is spoken --------------------------------
  await driver.enterBlockSelection("escape into selection mode", 1);
  await page.waitForTimeout(400);
  const single = await politeText();
  r.note(`polite after Escape: ${JSON.stringify(single)}`);
  r.ok(
    "Escape announces position and selected state",
    /, block \d+ of \d+, selected$/.test(single),
    `got ${JSON.stringify(single)}`,
  );
  r.eq(
    "Escape names the block by type label and text",
    single,
    `Text: bravo, block 2 of ${n}, selected`,
  );
  r.eq("exactly one row carries the sr-only marker", await markedRows(), 1);
  r.eq(
    "the marker count matches the selection size",
    await markedRows(),
    await driver.selectedCount(),
  );

  // ---- 4. Extending the range is spoken as a count -------------------------
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForTimeout(400);
  const pair = await politeText();
  r.note(`polite after Shift+ArrowDown: ${JSON.stringify(pair)}`);
  r.ok(
    "Shift+ArrowDown announces a two-block selection",
    pair.endsWith(", 2 blocks selected"),
    `got ${JSON.stringify(pair)}`,
  );
  r.eq(
    "the extended announcement names the new head",
    pair,
    `Text: charlie, block 3 of ${n}, 2 blocks selected`,
  );
  r.eq("exactly two rows carry the sr-only marker", await markedRows(), 2);
  r.eq(
    "the marker count still matches the selection size",
    await markedRows(),
    await driver.selectedCount(),
  );

  // ---- 5. Select-all is spoken as a whole-document fact --------------------
  await driver.checkSelectionOwnsFocus("select all");
  await page.keyboard.press("ControlOrMeta+a");
  await page.waitForTimeout(400);
  const all = await politeText();
  r.note(`polite after Cmd/Ctrl+A: ${JSON.stringify(all)}`);
  r.eq(
    "Cmd/Ctrl+A announces every block selected",
    all,
    `All ${n} blocks selected`,
  );
  r.eq("every row carries the sr-only marker", await markedRows(), n);

  // ---- 6. Clearing is spoken ONCE, then falls silent -----------------------
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const cleared = await politeText();
  r.note(`polite after Escape (clear): ${JSON.stringify(cleared)}`);
  r.eq(
    "Escape announces the selection was cleared",
    cleared,
    "Selection cleared",
  );
  r.eq("no row carries the sr-only marker any more", await markedRows(), 0);

  // The guard: a clear over an empty selection is a sentence about nothing. A
  // repeat would be VISIBLE here even though it is inaudible — the store appends
  // a toggling trailing space precisely so an identical re-announcement still
  // changes the DOM. So byte equality is the assertion.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const afterSecond = await politeText();
  r.note(`polite after the second Escape: ${JSON.stringify(afterSecond)}`);
  r.eq(
    "a second Escape over an empty selection announces nothing",
    afterSecond,
    cleared,
  );

  r.finish();
});
