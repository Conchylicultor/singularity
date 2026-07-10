// Block-selection mode entry points, verified in a real browser.
// See research/2026-07-10-page-escape-block-selection.md
//
// The defect: the selection container's React `onKeyDown` re-handled the very
// keydown a block's Lexical handler had already consumed, because it asked
// `document.activeElement` (moved mid-dispatch by `focusContainer()`) instead of
// the event's own `e.target`. Escape therefore selected a block and immediately
// cleared it; Shift+Arrow at a block edge extended the range twice.
//
// Measured on the unfixed build: Escape -> "0 selected", Shift+ArrowUp -> "3 selected".
//
// Usage: bun e2e/block-selection-verify.mjs --base http://<wt>.localhost:9000
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
if (!base) {
  console.error("Usage: bun e2e/block-selection-verify.mjs --base <url>");
  process.exit(2);
}

const failures = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} -> ${JSON.stringify(actual)}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);
await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);

// Four sibling blocks: alpha / bravo / charlie / delta.
const first = page.locator('[data-block-id] [contenteditable="true"]').first();
await first.waitFor({ state: "visible", timeout: 10000 });
await first.click();
for (const word of ["alpha", "bravo", "charlie", "delta"]) {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(800);

/** The selection bar's live count ("N selected"). The bar stays mounted (faded) at 0. */
const selectedCount = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) =>
      /^\d+ selected$/.test(s.textContent ?? ""),
    );
    return el ? Number(el.textContent.split(" ")[0]) : null;
  });

/** Rows painted with the block-selection highlight. */
const highlightedRows = () =>
  page.evaluate(
    () => document.querySelectorAll("[data-block-id] .bg-primary\\/10").length,
  );

const containerFocused = () =>
  page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Page blocks");

const block = (i) => page.locator('[data-block-id] [contenteditable="true"]').nth(i);

// A block's indent depth is rendered as the ROW's own left padding
// (`contentLeft = BLOCK_GUTTER + depth * BLOCK_INDENT`), so the row's rect never
// moves — its text does. Measure the contenteditable's left edge.
const contentLeftOf = (i) =>
  page.evaluate((n) => {
    const editables = document.querySelectorAll('[data-block-id] [contenteditable="true"]');
    return editables[n]?.getBoundingClientRect().left ?? -1;
  }, i);

// 1. Escape inside a block enters selection mode (the reported bug).
await block(2).click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape in a block selects it", await selectedCount(), 1);
check("Escape highlights exactly one row", await highlightedRows(), 1);
check("Escape focuses the selection container", await containerFocused(), true);

// 2. Escape in selection mode clears it (the branch the origin guard must keep).
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape again clears the selection", await selectedCount(), 0);
check("no row stays highlighted", await highlightedRows(), 0);

// 3. Shift+ArrowUp at a block's first line extends by exactly one block.
await block(2).click();
await page.keyboard.press("Home");
await page.waitForTimeout(200);
await page.keyboard.press("Shift+ArrowUp");
await page.waitForTimeout(400);
check("Shift+ArrowUp at the edge selects two blocks", await selectedCount(), 2);

// 4. Tab in selection mode indents the selection — the affordance the bug hid.
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await block(2).click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const before = await contentLeftOf(2);
await page.keyboard.press("Tab");
await page.waitForTimeout(800);
const after = await contentLeftOf(2);
check("Tab indents the selected block", after - before, 24 /* BLOCK_INDENT */);
check("the selection survives the indent", await selectedCount(), 1);

// 5. Shift+Tab puts it back.
await page.keyboard.press("Shift+Tab");
await page.waitForTimeout(800);
check("Shift+Tab outdents it again", await contentLeftOf(2), before);

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll block-selection checks passed.");
