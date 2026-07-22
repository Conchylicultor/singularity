// Enter-at-start identity-preservation verification
// (research/2026-07-22-page-enter-at-start-identity-preservation.md).
//
// Pressing Enter at the very start of a NON-EMPTY block must PRESERVE the origin
// block's identity: insert a new EMPTY sibling ABOVE and leave the origin block
// itself (its id, text, content doc) untouched, caret staying in the origin.
//
//  1. blank page; type "hello world" into the first block; capture its block id
//     (originId) and let the ~1s doc→data.text projection land;
//  2. caret to offset 0, press Enter;
//  3. assert: TWO blocks; the block still carrying originId holds "hello world";
//     a NEW EMPTY block sits ABOVE it in DOM order; the origin id is unchanged;
//  4. assert the caret is collapsed in originId at offset 0;
//  5. type a char → it lands in originId (the content doc followed the id, never
//     churned to a fresh block);
//  6. Cmd+Z (undo the typing), Cmd+Z (undo the split) → the empty block above
//     disappears in one undo, one block left under originId, text intact;
//  7. converge in a SECOND browser context (fresh socket, cold load).
//
// Usage: bun e2e/enter-at-start-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/eas
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/eas");
if (!base) {
  console.error("Usage: bun e2e/enter-at-start-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

// Ordered list of every text-block id in document order.
async function blockIdsInOrder(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-block-id]")]
      .filter((el) => el.querySelector('[contenteditable="true"]'))
      .map((el) => el.getAttribute("data-block-id")),
  );
}

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();
pageA.on("pageerror", (err) => console.log("PAGEERROR(A):", err.message));

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);
await pageA.getByText("Blank page", { exact: true }).first().click();
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();
console.log("page url:", pageUrl);

const block = pageA.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
const originId = await block.evaluate((el) =>
  el.closest("[data-block-id]").getAttribute("data-block-id"),
);
console.log("origin id:", originId);
await block.click();

// --- 1. compose a non-empty block -------------------------------------------
await pageA.keyboard.type("hello world", { delay: 15 });
// Let the doc flush (300ms) + projection (1s) land.
await pageA.waitForTimeout(2500);
await pageA.screenshot({ path: `${out}-1-composed.png` });
const composedText = (await block.innerText()).replace(/ /g, " ").trim();
check("compose: origin holds 'hello world'", composedText === "hello world", composedText);

// --- 2. Enter at the very start ---------------------------------------------
// Home / Cmd+ArrowLeft don't move the caret in headless Chromium on macOS —
// click at the text's left edge instead (nearest position = offset 0).
await block.click({ position: { x: 2, y: 12 } });
await pageA.waitForTimeout(300);
const preEnterCaret = await pageA.evaluate(() => {
  const sel = window.getSelection();
  return sel && sel.rangeCount > 0
    ? { anchorText: sel.anchorNode?.textContent ?? null, anchorOffset: sel.anchorOffset }
    : null;
});
console.log("pre-Enter caret:", JSON.stringify(preEnterCaret));
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(1500);
await pageA.screenshot({ path: `${out}-2-entered.png` });

const idsAfter = await blockIdsInOrder(pageA);
console.log("ids after Enter:", JSON.stringify(idsAfter));
check("enter: two text blocks", idsAfter.length === 2, `count=${idsAfter.length}`);
check("enter: origin id still present (no id churn)", idsAfter.includes(originId));

// The origin keeps its full text under its ORIGINAL id.
const origin = pageA.locator(`[data-block-id="${originId}"] [contenteditable="true"]`).first();
const originText = (await origin.innerText()).replace(/ /g, " ").trim();
check("enter: origin still holds 'hello world'", originText === "hello world", originText);

// A NEW EMPTY block sits ABOVE the origin in document order.
const originIdx = idsAfter.indexOf(originId);
const aboveId = originIdx > 0 ? idsAfter[originIdx - 1] : null;
check("enter: a new block sits ABOVE the origin", aboveId != null && aboveId !== originId, `above=${aboveId}`);
if (aboveId) {
  const above = pageA.locator(`[data-block-id="${aboveId}"] [contenteditable="true"]`).first();
  const aboveText = (await above.innerText()).replace(/ /g, " ").trim();
  check("enter: the block above is EMPTY", aboveText === "", JSON.stringify(aboveText));
}

// Caret stays in the ORIGIN at offset 0 (it never lost focus).
const enterCaret = await pageA.evaluate((oid) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { has: false };
  const el = document.querySelector(`[data-block-id="${oid}"] [contenteditable="true"]`);
  return {
    has: true,
    collapsed: sel.isCollapsed,
    inOrigin: !!el && el.contains(sel.anchorNode),
    anchorOffset: sel.anchorOffset,
  };
}, originId);
console.log("enter caret:", JSON.stringify(enterCaret));
check(
  "enter: caret stays in the ORIGIN at offset 0",
  enterCaret.has && enterCaret.collapsed && enterCaret.inOrigin && enterCaret.anchorOffset === 0,
);

// --- 3. type a char → it lands in the ORIGIN (content doc followed the id) ----
await pageA.keyboard.type("Z", { delay: 15 });
await pageA.waitForTimeout(800);
const typedText = (await origin.innerText()).replace(/ /g, " ").trim();
check("type: char lands at the start of the ORIGIN block", typedText === "Zhello world", typedText);
const idsAfterType = await blockIdsInOrder(pageA);
check("type: origin id unchanged after typing", idsAfterType.includes(originId));

// --- 4. Undo the typing, then undo the split --------------------------------
await pageA.keyboard.press("Meta+z"); // undo the "Z"
await pageA.waitForTimeout(1000);
const afterUndoType = (await origin.innerText()).replace(/ /g, " ").trim();
check("undo: typing reverted, origin back to 'hello world'", afterUndoType === "hello world", afterUndoType);

await pageA.keyboard.press("Meta+z"); // undo the split (empty block above)
await pageA.waitForTimeout(1200);
await pageA.screenshot({ path: `${out}-3-undone.png` });
const idsAfterUndo = await blockIdsInOrder(pageA);
console.log("ids after undo:", JSON.stringify(idsAfterUndo));
check("undo: empty block removed in one undo", idsAfterUndo.length === 1, `count=${idsAfterUndo.length}`);
check("undo: the surviving block is the ORIGIN", idsAfterUndo[0] === originId, `id=${idsAfterUndo[0]}`);
const afterUndoText = (await origin.innerText()).replace(/ /g, " ").trim();
check("undo: origin text intact", afterUndoText === "hello world", afterUndoText);

// Let projections settle before the convergence read.
await pageA.waitForTimeout(2000);

// --- 5. Convergence in a second context --------------------------------------
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const originB = pageB.locator(`[data-block-id="${originId}"] [contenteditable="true"]`).first();
await originB.waitFor({ state: "visible", timeout: 15000 });
const textB = (await originB.innerText()).replace(/ /g, " ").trim();
const countB = (await blockIdsInOrder(pageB)).length;
await pageB.screenshot({ path: `${out}-4-context-b.png` });
console.log("context B text:", JSON.stringify(textB), "count:", countB);
check("converge: context B matches (origin id + text)", textB === "hello world" && countB === 1, `count=${countB}`);

console.log("ORIGIN_ID:", originId);
console.log("PAGE_URL:", pageUrl);

await browser.close();
if (failures.length > 0) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
