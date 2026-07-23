// Copy/paste verification for the pages block editor, in a real browser.
// See research/2026-07-16-page-typed-block-markdown.md
//
// The defect: `blocksToMarkdown` duck-typed `data.text` as a string, so after
// the runs migration every copied block's text/plain flavor was empty — and a
// caret-in-block paste (handled by Lexical, which only reads text/plain) dumped
// whitespace-only paragraphs into one block. Verifies all three fixed flows:
//   A. block-selection copy writes real markdown text to the clipboard
//   B. block-selection paste round-trips blocks (BLOCKS_MIME)
//   C. caret-in-block paste of copied blocks inserts REAL blocks (new plugin)
//   D. caret-in-block paste of external multi-line markdown splits into typed blocks
//   E. block-selection paste anchors on the selection's document-order END, so an
//      UPWARD-extended range is not split in half by its own copies
//      (research/2026-07-16-page-paste-anchor-selection-end.md)
//
// Usage: bun plugins/page/plugins/editor/e2e/copy-paste-verify.ts [--base <url>]
import {
  baseUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { editableBlocks, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const r = report();

await withBrowser(async (h) => {
  const { context, page } = await h.session();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await openBlankPage(page, base, { settleMs: 3000 });

  for (const word of ["alpha", "bravo", "charlie"]) {
    await page.keyboard.type(word);
    await page.keyboard.press("Enter");
  }
  // Leave the trailing empty block; wait out the doc→data.text projection (~1s).
  await page.waitForTimeout(2000);

  const blockTexts = (): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll('[data-block-id] [contenteditable="true"]'),
      ].map((el) => (el.textContent ?? "").trim()),
    );

  r.eq("setup: three typed blocks", (await blockTexts()).slice(0, 3), [
    "alpha",
    "bravo",
    "charlie",
  ]);

  const block = (i: number) => editableBlocks(page).nth(i);

  // Entering block-selection mode is RACY, and losing the race silently swaps the
  // code path under test. ~300-500ms after a click lands in a block, an async
  // Lexical/@lexical/yjs focus steal drags DOM focus BACK into that block's
  // contenteditable with no user input (task-1784221574192-phh891). That fires
  // `useBlockSelection`'s onFocusCapture -> clearSelection(), destroying the block
  // selection without a trace.
  //
  // Every clipboard handler in block-editor.tsx opens with
  // `if (document.activeElement !== containerRef.current) return;`. Once the steal
  // wins, that guard returns early and Cmd+V falls through to the per-block Lexical
  // caret paste (block-forest-paste-plugin.tsx), which anchors on the caret's OWN
  // block — so the assertion after it measures the caret path while claiming to
  // measure block-selection mode, and can pass or fail for entirely the wrong
  // reason. Hence: assert ownership immediately before EACH clipboard op. The steal
  // is a wall-clock timer off the CLICK, so it can land between the Cmd+C and the
  // Cmd+V — empirically it does, which makes a single check before the copy vacuous
  // (the copy succeeds, only the paste is diverted).
  async function checkSelectionOwnsFocus(label: string): Promise<void> {
    const focusStolen = await page.evaluate(
      () => document.activeElement?.getAttribute("contenteditable") === "true",
    );
    r.eq(
      `${label}: block selection owns focus (not stolen back into a block — task-1784221574192-phh891)`,
      focusStolen,
      false,
    );
  }

  // Settle past the steal BEFORE Escape (measured: click -> Escape -> Shift+Arrow
  // back-to-back reliably loses the selection; ~200ms+ makes it stick), then prove
  // focus actually stuck rather than trusting the sleep.
  async function enterBlockSelection(
    label: string,
    blockIndex: number,
    extendKey: string,
  ): Promise<void> {
    await block(blockIndex).click(); // caret in the block
    await page.waitForTimeout(500); // outlast the async focus steal before Escape
    await page.keyboard.press("Escape"); // -> selection mode, container focused
    await page.keyboard.press(extendKey); // extend the range
    await checkSelectionOwnsFocus(`${label} (copy)`);
  }

  // ---- A: block-selection copy writes real text/plain ------------------------
  await enterBlockSelection("A", 0, "Shift+ArrowDown"); // "alpha" + "bravo"
  await page.keyboard.press("Meta+c");
  await page.waitForTimeout(300);

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  r.eq("A: copied text/plain carries the block text", copied, "alpha\nbravo");

  // ---- B: block-selection paste (container path, BLOCKS_MIME) -----------------
  // The copies land after the selection's end ("bravo"), leaving the selected run
  // intact.
  await checkSelectionOwnsFocus("B (paste)");
  await page.keyboard.press("Meta+v");
  await page.waitForTimeout(2000); // server insert + push round-trip
  r.eq(
    "B: selection-mode paste inserts real copies",
    (await blockTexts()).slice(0, 6),
    ["alpha", "bravo", "alpha", "bravo", "charlie", ""],
  );

  // ---- C: caret-in-block paste of copied blocks (new Lexical plugin) ----------
  await block(4).click(); // caret inside "charlie"
  await page.keyboard.press("Meta+v");
  await page.waitForTimeout(2000);
  r.eq(
    "C: caret-in-block paste inserts real blocks after it",
    (await blockTexts()).slice(0, 8),
    ["alpha", "bravo", "alpha", "bravo", "charlie", "alpha", "bravo", ""],
  );

  // ---- D: external multi-line markdown paste splits into typed blocks ---------
  await page.evaluate(() =>
    navigator.clipboard.writeText("# Head\n- bullet\n- [x] task done"),
  );
  const last = editableBlocks(page).last();
  await last.click(); // caret in the trailing empty block
  await page.keyboard.press("Meta+v");
  await page.waitForTimeout(2000);

  const tail = (await blockTexts()).slice(7);
  r.eq("D: markdown lines became separate blocks", tail, [
    "",
    "Head",
    "bullet",
    "task done",
  ]);
  const hasCheckbox = await page.evaluate(() =>
    [...document.querySelectorAll("[data-block-id]")].some((row) =>
      row.querySelector('[role="checkbox"], input[type="checkbox"]'),
    ),
  );
  r.eq("D: to-do rendered with checkbox chrome", hasCheckbox, true);
  // Block TYPES (heading-1 / bulleted-list / to-do + checked) are asserted
  // against the DB by the caller — the page URL is printed for that.
  console.log("PAGE_URL " + page.url());

  // ---- E: an UPWARD-extended selection pastes after its end, not its head ------
  // D left: alpha bravo alpha bravo charlie alpha bravo "" Head bullet "task done".
  // Extending up from "charlie" (block 4) puts the range's HEAD on "bravo" (block
  // 3) — the TOP of the run. Anchoring there is the defect: the copies would land
  // between the two selected blocks (bravo, bravo', charlie', charlie).
  await enterBlockSelection("E", 4, "Shift+ArrowUp"); // "charlie", extended UP to "bravo"
  await page.keyboard.press("Meta+c");
  await page.waitForTimeout(300);
  await checkSelectionOwnsFocus("E (paste)");
  await page.keyboard.press("Meta+v");
  await page.waitForTimeout(2000);
  r.eq(
    "E: upward-extended selection pastes after its end",
    (await blockTexts()).slice(0, 9),
    [
      "alpha",
      "bravo",
      "alpha",
      "bravo",
      "charlie",
      "bravo",
      "charlie",
      "alpha",
      "bravo",
    ],
  );

  r.finish();
});
