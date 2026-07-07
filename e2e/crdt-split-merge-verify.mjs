// Stage-3a per-block CRDT verification (research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a blank page; type a mixed block: plain + BOLD run + a real
//     `[[` page-link token + a real `@` inline-date token + plain tail;
//  2. wait for the doc→data.text projection (~1s debounce) — the DB row is
//     checked by the caller via query_db using the printed block id;
//  3. SPLIT mid-bold-word (caret inside "boldy" after "bol") → head keeps
//     "alpha bol" with bold intact, the tail block gets "dy tail … end" with
//     the token decorators intact;
//  4. MERGE the tail back with Backspace-at-start → concatenated text + marks
//     restored, caret collapsed at the join;
//  5. converge in a SECOND browser context (fresh socket, cold load).
//
// Usage: bun e2e/crdt-split-merge-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/sm
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/sm");
if (!base) {
  console.error("Usage: bun e2e/crdt-split-merge-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
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
const block1Id = await block.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
console.log("block1 id:", block1Id);
await block.click();

// --- 1. compose the mixed block ---------------------------------------------
await pageA.keyboard.type("alpha ", { delay: 15 });
await pageA.keyboard.press("Control+b");
await pageA.keyboard.type("boldy", { delay: 15 });
await pageA.keyboard.press("Control+b");
await pageA.keyboard.type(" tail ", { delay: 15 });
// Real page-link token via the [[ typeahead (Enter selects the active option).
await pageA.keyboard.type("[[", { delay: 30 });
await pageA.waitForTimeout(1200);
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(500);
// Real inline-date token via the @ typeahead (Enter selects "Today").
await pageA.keyboard.type(" @", { delay: 30 });
await pageA.waitForTimeout(1200);
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(500);
await pageA.keyboard.type(" omega end", { delay: 15 });

// Let the doc flush (300ms) + projection (1s) land.
await pageA.waitForTimeout(2500);
await pageA.screenshot({ path: `${out}-1-composed.png` });

const composedText = (await block.innerText()).replace(/ /g, " ").trim();
console.log("composed block1 text:", JSON.stringify(composedText));
const composedBold = await block.evaluate(
  (el) => [...el.querySelectorAll("strong, .font-bold")].map((n) => n.textContent).join("|"),
);
check("compose: bold run present", composedBold.includes("boldy"), `bold nodes: ${composedBold}`);
const composedTokens = await block.evaluate((el) => ({
  // decorator chips render as non-text inline elements; count anything the two
  // token plugins render (page-link + date chips both carry a data-lexical-decorator wrapper)
  decorators: el.querySelectorAll("[data-lexical-decorator]").length,
}));
check("compose: 2 decorator tokens", composedTokens.decorators >= 2, `found ${composedTokens.decorators}`);

// --- 2. SPLIT mid-bold-word ---------------------------------------------------
// Caret to the very start, then 9 x ArrowRight = after "alpha bol" (inside boldy).
// NOTE: Home / Cmd+ArrowLeft don't move the caret in headless Chromium on
// macOS — click at the text's left edge instead (nearest position = offset 0).
await block.click({ position: { x: 2, y: 12 } });
await pageA.waitForTimeout(300);
// Slow enough for Lexical to absorb each native caret move via selectionchange
// (its internal selection lags the DOM under a rapid synthetic key burst).
for (let i = 0; i < 9; i++) {
  await pageA.keyboard.press("ArrowRight");
  await pageA.waitForTimeout(60);
}
await pageA.waitForTimeout(500);
const preSplitCaret = await pageA.evaluate(() => {
  const sel = window.getSelection();
  return sel && sel.rangeCount > 0
    ? { anchorText: sel.anchorNode?.textContent ?? null, anchorOffset: sel.anchorOffset }
    : null;
});
console.log("pre-split caret:", JSON.stringify(preSplitCaret));
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(1500);
await pageA.screenshot({ path: `${out}-2-split.png` });

const blocks = pageA.locator('[data-block-id]:has([contenteditable="true"])');
const blockCount = await blocks.count();
check("split: two text blocks", blockCount === 2, `count=${blockCount}`);

const head = pageA.locator(`[data-block-id="${block1Id}"] [contenteditable="true"]`).first();
const headText = (await head.innerText()).replace(/ /g, " ").trim();
const tailBlockId = await pageA.evaluate((b1) => {
  const all = [...document.querySelectorAll("[data-block-id]")].filter((el) =>
    el.querySelector('[contenteditable="true"]'),
  );
  return all.map((el) => el.getAttribute("data-block-id")).find((id) => id !== b1) ?? null;
}, block1Id);
console.log("block2 id:", tailBlockId);
const tail = pageA.locator(`[data-block-id="${tailBlockId}"] [contenteditable="true"]`).first();
const tailText = (await tail.innerText()).replace(/ /g, " ").trim();
console.log("head text:", JSON.stringify(headText));
console.log("tail text:", JSON.stringify(tailText));
check("split: head is 'alpha bol'", headText === "alpha bol");
check("split: tail starts with 'dy tail'", tailText.startsWith("dy tail"));
check("split: tail keeps the trailing text", tailText.endsWith("omega end"));

const headBold = await head.evaluate(
  (el) => [...el.querySelectorAll("strong, .font-bold")].map((n) => n.textContent).join("|"),
);
const tailBold = await tail.evaluate(
  (el) => [...el.querySelectorAll("strong, .font-bold")].map((n) => n.textContent).join("|"),
);
check("split: head bold = 'bol'", headBold === "bol", headBold);
check("split: tail bold = 'dy'", tailBold === "dy", tailBold);
const tailDecorators = await tail.evaluate(
  (el) => el.querySelectorAll("[data-lexical-decorator]").length,
);
check("split: tail keeps both tokens", tailDecorators >= 2, `found ${tailDecorators}`);

// Caret should be in block2 at offset 0.
const splitCaret = await pageA.evaluate((tid) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { has: false };
  const el = document.querySelector(`[data-block-id="${tid}"] [contenteditable="true"]`);
  return {
    has: true,
    collapsed: sel.isCollapsed,
    inTail: !!el && el.contains(sel.anchorNode),
    anchorOffset: sel.anchorOffset,
  };
}, tailBlockId);
console.log("split caret:", JSON.stringify(splitCaret));
check(
  "split: caret in block2 at offset 0",
  splitCaret.has && splitCaret.collapsed && splitCaret.inTail && splitCaret.anchorOffset === 0,
);

// Give the projection time to write both rows before the merge (checked in DB later
// via the *merge* result; the split rows are transient).
await pageA.waitForTimeout(2000);

// --- 3. MERGE back with Backspace at start of block2 -------------------------
await tail.click({ position: { x: 2, y: 12 } }); // caret to offset 0 (see above)
await pageA.waitForTimeout(300);
await pageA.keyboard.press("Backspace");
await pageA.waitForTimeout(1500);
await pageA.screenshot({ path: `${out}-3-merged.png` });

const afterMergeCount = await blocks.count();
check("merge: back to one text block", afterMergeCount === 1, `count=${afterMergeCount}`);
const mergedText = (await head.innerText()).replace(/ /g, " ").trim();
console.log("merged text:", JSON.stringify(mergedText));
check("merge: text equals pre-split text", mergedText === composedText, mergedText);
const mergedBold = await head.evaluate(
  (el) => [...el.querySelectorAll("strong, .font-bold")].map((n) => n.textContent).join(""),
);
check("merge: bold run restored to 'boldy'", mergedBold === "boldy", mergedBold);
const mergedDecorators = await head.evaluate(
  (el) => el.querySelectorAll("[data-lexical-decorator]").length,
);
check("merge: both tokens survive", mergedDecorators >= 2, `found ${mergedDecorators}`);

const mergeCaret = await pageA.evaluate((b1) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { has: false };
  const el = document.querySelector(`[data-block-id="${b1}"] [contenteditable="true"]`);
  return {
    has: true,
    collapsed: sel.isCollapsed,
    inHead: !!el && el.contains(sel.anchorNode),
    anchorText: sel.anchorNode?.textContent ?? null,
    anchorOffset: sel.anchorOffset,
  };
}, block1Id);
console.log("merge caret:", JSON.stringify(mergeCaret));
// Join offset is linear 9 = between "bol" and "dy" — after Lexical re-coalesces,
// that's inside/at the boundary of the bold text ("bol"|3 or "boldy"|3).
check(
  "merge: caret collapsed at the join",
  mergeCaret.has && mergeCaret.collapsed && mergeCaret.inHead &&
    ((mergeCaret.anchorText === "bol" && mergeCaret.anchorOffset === 3) ||
      (mergeCaret.anchorText === "boldy" && mergeCaret.anchorOffset === 3) ||
      (mergeCaret.anchorText === "dy" && mergeCaret.anchorOffset === 0)),
);

// Let the merge projection land.
await pageA.waitForTimeout(2500);

// --- 4. Convergence in a second context --------------------------------------
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const headB = pageB.locator(`[data-block-id="${block1Id}"] [contenteditable="true"]`).first();
await headB.waitFor({ state: "visible", timeout: 15000 });
const textB = (await headB.innerText()).replace(/ /g, " ").trim();
const countB = await pageB.locator('[data-block-id]:has([contenteditable="true"])').count();
await pageB.screenshot({ path: `${out}-4-context-b.png` });
console.log("context B text:", JSON.stringify(textB));
check("converge: context B matches", textB === mergedText && countB === 1, `count=${countB}`);

console.log("BLOCK1_ID:", block1Id);
console.log("BLOCK2_ID:", tailBlockId);
console.log("PAGE_URL:", pageUrl);

await browser.close();
if (failures.length > 0) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
