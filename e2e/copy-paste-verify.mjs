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
//
// Usage: bun e2e/copy-paste-verify.mjs --base http://<wt>.localhost:9000
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
if (!base) {
  console.error("Usage: bun e2e/copy-paste-verify.mjs --base <url>");
  process.exit(2);
}

const failures = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} -> ${JSON.stringify(actual)}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);
await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);

const first = page.locator('[data-block-id] [contenteditable="true"]').first();
await first.waitFor({ state: "visible", timeout: 10000 });
await first.click();
for (const word of ["alpha", "bravo", "charlie"]) {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
}
// Leave the trailing empty block; wait out the doc→data.text projection (~1s).
await page.waitForTimeout(2000);

const blockTexts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) =>
      (el.textContent ?? "").trim(),
    ),
  );

check("setup: three typed blocks", (await blockTexts()).slice(0, 3), ["alpha", "bravo", "charlie"]);

// ---- A: block-selection copy writes real text/plain ------------------------
const block = (i) => page.locator('[data-block-id] [contenteditable="true"]').nth(i);
await block(0).click(); // caret in "alpha"
await page.keyboard.press("Escape"); // -> selection mode, container focused
await page.keyboard.press("Shift+ArrowDown"); // extend to "bravo"
await page.keyboard.press("Meta+c");
await page.waitForTimeout(300);

const copied = await page.evaluate(() => navigator.clipboard.readText());
check("A: copied text/plain carries the block text", copied, "alpha\nbravo");

// ---- B: block-selection paste (container path, BLOCKS_MIME) -----------------
// The container inserts after the selection HEAD (pre-existing `afterId =
// headRef.current ?? …` rule) — here "alpha" — so the copies land right after it.
await page.keyboard.press("Meta+v");
await page.waitForTimeout(2000); // server insert + push round-trip
check("B: selection-mode paste inserts real copies", (await blockTexts()).slice(0, 6), [
  "alpha", "alpha", "bravo", "bravo", "charlie", "",
]);

// ---- C: caret-in-block paste of copied blocks (new Lexical plugin) ----------
await block(4).click(); // caret inside "charlie"
await page.keyboard.press("Meta+v");
await page.waitForTimeout(2000);
check("C: caret-in-block paste inserts real blocks after it", (await blockTexts()).slice(0, 8), [
  "alpha", "alpha", "bravo", "bravo", "charlie", "alpha", "bravo", "",
]);

// ---- D: external multi-line markdown paste splits into typed blocks ---------
await page.evaluate(() =>
  navigator.clipboard.writeText("# Head\n- bullet\n- [x] task done"),
);
const last = page.locator('[data-block-id] [contenteditable="true"]').last();
await last.click(); // caret in the trailing empty block
await page.keyboard.press("Meta+v");
await page.waitForTimeout(2000);

const tail = (await blockTexts()).slice(7);
check("D: markdown lines became separate blocks", tail, ["", "Head", "bullet", "task done"]);
const hasCheckbox = await page.evaluate(() =>
  [...document.querySelectorAll("[data-block-id]")].some((r) =>
    r.querySelector('[role="checkbox"], input[type="checkbox"]'),
  ),
);
check("D: to-do rendered with checkbox chrome", hasCheckbox, true);
// Block TYPES (heading-1 / bulleted-list / to-do + checked) are asserted
// against the DB by the caller — the page URL is printed for that.
console.log("PAGE_URL " + page.url());

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):\n` + failures.join("\n"));
  process.exit(1);
}
console.log("\nAll copy/paste flows verified.");
