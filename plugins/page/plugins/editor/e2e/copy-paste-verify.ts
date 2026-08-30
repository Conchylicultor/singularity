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
//   F. a caret paste of FOREIGN markup whose text/html carries several blocks but
//      whose text/plain is one line lands inside the block, never as a second
//      paragraph in its root — the one-paragraph-per-block invariant, enforced by
//      `BlockClipboardInsertPlugin`. `decideTransfer` reads text/plain and declines
//      such a payload, so before the guard it reached Lexical's own insert, which
//      splits the paragraph. Real editors emit exactly this pair.
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
  const { checkSelectionOwnsFocus, enterBlockSelection } = blockSelectionDriver(
    page,
    r,
  );

  await openBlankPage(page, base, { settleMs: 3000 });

  // Leave the trailing empty block; wait out the doc→data.text projection (~1s).
  await typeLines(page, ["alpha", "bravo", "charlie"], { trailingEnter: true });
  await page.waitForTimeout(2000);

  const blockTexts = (): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-block-id] [contenteditable="true"]',
        ),
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

  // ---- F: foreign multi-block HTML with one-line text/plain stays in the block --
  // Synthesised rather than copied, because the pair (multi-block text/html +
  // single-line text/plain) is what OTHER apps put on the clipboard — this
  // editor's own copy never writes text/html at all.
  // Phase E left block-selection mode on, whose floating SelectionBar sits over
  // the rows — leave it before reaching for a caret.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await block(0).click();
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  const beforeF = await blockTexts();
  await page.evaluate(() => {
    const el = document.querySelector(
      '[data-block-id] [contenteditable="true"]',
    ) as HTMLElement | null;
    if (!el) throw new Error("no editable block");
    const dt = new DataTransfer();
    dt.setData("text/plain", "onetwo");
    dt.setData("text/html", "<p>one</p><p>two</p>");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForTimeout(2000);
  const afterF = await blockTexts();
  r.eq("F: the paste minted no block", afterF.length, beforeF.length);
  // One block, both paragraphs' text, joined by the soft break a line boundary
  // inside a block already is. `textContent` reads the `<br>` as nothing.
  r.eq(
    "F: both paragraphs landed in the caret's block",
    afterF[0],
    "alphaonetwo",
  );
  const rootParagraphs = await page.evaluate(
    () =>
      document.querySelector('[data-block-id] [contenteditable="true"]')
        ?.childElementCount ?? -1,
  );
  r.eq("F: the block's root still holds ONE paragraph", rootParagraphs, 1);

  await r.finish();
});
