// Tab-indent / Shift+Tab-outdent caret-preservation verification.
//
// Indenting a block must not move the caret: Tab is a STRUCTURAL move (the row
// changes parent, the same block keeps its id, its editor, and its DOM focus),
// so the caret must stay exactly where the user left it — mid-word included.
// The regression this pins: the executor's post-op re-focus landed the caret at
// the block's content START ("rootStart"), so Tab silently sent the caret home.
//
//  1. blank page; type "hello" into the first block, Enter, type "second line";
//  2. put the caret mid-word (offset 6 of "second line"), press Tab;
//  3. assert: the block indented (its row's paddingLeft grew) AND the caret is
//     still collapsed in the SAME block at offset 6;
//  4. type a char → it lands at the caret, not at the block's start;
//  5. Shift+Tab (outdent) with the caret mid-text → same assertions in reverse.
//
// Usage: bun e2e/indent-caret-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/ind
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/ind");
if (!base) {
  console.error("Usage: bun e2e/indent-caret-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** Linear caret offset within a block, plus which block holds it. */
async function readCaret(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { has: false };
    const editable = sel.anchorNode?.parentElement?.closest?.('[contenteditable="true"]')
      ?? (sel.anchorNode instanceof Element ? sel.anchorNode.closest('[contenteditable="true"]') : null);
    if (!editable) return { has: true, inBlock: null };
    // Linear offset = text before the anchor within the editable.
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return {
      has: true,
      collapsed: sel.isCollapsed,
      inBlock: editable.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
      offset: range.toString().length,
    };
  });
}

/** A block row's left padding — the rendered indent depth. */
async function rowPadding(page, id) {
  return page.evaluate(
    (bid) => parseFloat(getComputedStyle(document.querySelector(`[data-block-id="${bid}"]`)).paddingLeft),
    id,
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);
await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);
console.log("page url:", page.url());

const first = page.locator('[data-block-id] [contenteditable="true"]').first();
await first.waitFor({ state: "visible", timeout: 10000 });
await first.click();

// --- 1. two blocks, the second one is the mover ------------------------------
await page.keyboard.type("hello", { delay: 15 });
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
await page.keyboard.type("second line", { delay: 15 });
await page.waitForTimeout(2000);

const moverId = (await readCaret(page)).inBlock;
console.log("mover id:", moverId);
check("setup: caret is in the second block", moverId != null);

// --- 2. caret mid-word, then Tab --------------------------------------------
// From end-of-line (offset 11) back to offset 6 — inside "line".
for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(200);
const before = await readCaret(page);
console.log("caret before Tab:", JSON.stringify(before));
check("setup: caret parked mid-text at offset 6", before.offset === 6, `offset=${before.offset}`);
const padBefore = await rowPadding(page, moverId);

await page.keyboard.press("Tab");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-1-indented.png` });

const padAfter = await rowPadding(page, moverId);
check("indent: the row actually indented", padAfter > padBefore, `${padBefore} → ${padAfter}`);

const afterTab = await readCaret(page);
console.log("caret after Tab:", JSON.stringify(afterTab));
check(
  "indent: caret stays in the same block at the same offset",
  afterTab.has && afterTab.collapsed && afterTab.inBlock === moverId && afterTab.offset === 6,
  JSON.stringify(afterTab),
);

// --- 3. typing lands at the caret, not at the block start --------------------
await page.keyboard.type("X", { delay: 15 });
await page.waitForTimeout(600);
const mover = page.locator(`[data-block-id="${moverId}"] [contenteditable="true"]`).first();
const typed = (await mover.innerText()).replace(/ /g, " ").trim();
check("indent: the next char lands at the caret", typed === "secondX line", typed);

// --- 4. outdent with the caret mid-text --------------------------------------
const beforeOutdent = await readCaret(page);
console.log("caret before Shift+Tab:", JSON.stringify(beforeOutdent));
await page.keyboard.press("Shift+Tab");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-2-outdented.png` });

const padOut = await rowPadding(page, moverId);
check("outdent: the row actually outdented", padOut < padAfter, `${padAfter} → ${padOut}`);

const afterOutdent = await readCaret(page);
console.log("caret after Shift+Tab:", JSON.stringify(afterOutdent));
check(
  "outdent: caret stays in the same block at the same offset",
  afterOutdent.has &&
    afterOutdent.collapsed &&
    afterOutdent.inBlock === moverId &&
    afterOutdent.offset === beforeOutdent.offset,
  JSON.stringify(afterOutdent),
);

await browser.close();
if (failures.length > 0) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
