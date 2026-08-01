// Copy/paste verification for the pages block editor, in a real browser.
// See research/2026-07-16-page-typed-block-markdown.md
//
// The defect: `blocksToMarkdown` duck-typed `data.text` as a string, so after
// the runs migration every copied block's text/plain flavor was empty — and a
// caret-in-block paste (handled by Lexical, which only reads text/plain) dumped
// whitespace-only paragraphs into one block. Verifies all three fixed flows:
//   A. block-selection copy writes real markdown text to the clipboard
//   B. block-selection paste round-trips blocks (BLOCKS_MIME)
//   B2. Cmd+Z undoes exactly that paste, leaving the trailing empty block —
//      paste is a recorded op, not a write that slips past the undo stack
//      (research/2026-07-30-page-record-paste-and-bulkmove-on-the-undo-stack.md)
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
import { blockSelectionDriver } from "./support/block-selection";
import { typeLines } from "./support/type-lines";

const base = baseUrl();
const r = report();

await withBrowser(async (h) => {
  const { context, page } = await h.session();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { checkSelectionOwnsFocus, enterBlockSelection } = blockSelectionDriver(page, r);

  await openBlankPage(page, base, { settleMs: 3000 });

  // Leave the trailing empty block; wait out the doc→data.text projection (~1s).
  await typeLines(page, ["alpha", "bravo", "charlie"], { trailingEnter: true });
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

  // ---- B2: Cmd+Z undoes the paste ---------------------------------------------
  // The exact inverse of the reported symptom
  // (research/2026-07-30-page-record-paste-and-bulkmove-on-the-undo-stack.md):
  // Cmd+Z used to consume the PREVIOUS structural entry — the Enter that created
  // the trailing empty block — leaving the paste behind. So both halves matter:
  // the copies are gone AND the trailing empty block is still there.
  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(2000); // patch POST + push round-trip
  r.eq("B2: Cmd+Z removes exactly the pasted blocks", await blockTexts(), [
    "alpha",
    "bravo",
    "charlie",
    "",
  ]);

  // Redo, so the phases below run against B's state (and the inverse pair is
  // itself covered — an undo whose redo cannot land is only half a fix).
  await page.keyboard.press("Meta+Shift+z");
  await page.waitForTimeout(2000);
  r.eq("B2: Cmd+Shift+Z puts them back", (await blockTexts()).slice(0, 6), [
    "alpha",
    "bravo",
    "alpha",
    "bravo",
    "charlie",
    "",
  ]);

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
