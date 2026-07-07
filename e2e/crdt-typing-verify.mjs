// Stage-2 per-block CRDT verification (research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a blank page, focus its empty text block;
//  2. type a multi-word string FAST, in bursts, so debounced doc-update flushes
//     and their live-state echoes land MID-typing (the exact trigger of the old
//     "Generalization of Notion" → "Generationlization of No" scramble);
//  3. assert the final text is exactly what was typed and the caret sat at the
//     very end the whole time;
//  4. open the same page in a SECOND browser context and assert it converges to
//     the same text (server round-trip through doc-update → page_block_docs →
//     blockContentResource).
//
// Usage: bun e2e/crdt-typing-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/crdt
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/crdt");
if (!base) {
  console.error("Usage: bun e2e/crdt-typing-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const TYPED = "Generalization of Notion via per-block CRDT typing";

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();
pageA.on("pageerror", (err) => console.log("PAGEERROR(A):", err.message));

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);

// Create a fresh blank page from the landing quick-create tile.
const blank = pageA.getByText("Blank page", { exact: true }).first();
await blank.click();
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();
console.log("page url:", pageUrl);

// The blank page ships one empty text block. Focus its contenteditable.
const block = pageA.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
const blockId = await block.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
console.log("block id:", blockId);
await block.click();
await pageA.screenshot({ path: `${out}-before.png` });

// Type in fast bursts with pauses > the 300ms flush debounce, so the echo of
// each flushed doc-update lands WHILE the next burst is being typed.
const words = TYPED.split(" ");
const bursts = [words.slice(0, 2), words.slice(2, 4), words.slice(4, 6), words.slice(6)];
for (let i = 0; i < bursts.length; i++) {
  const chunk = (i === 0 ? "" : " ") + bursts[i].join(" ");
  await pageA.keyboard.type(chunk, { delay: 8 }); // ~125 chars/s — fast typing
  await pageA.waitForTimeout(450); // let the debounced flush + live echo land mid-run
}
// Let the final flush + echo settle.
await pageA.waitForTimeout(1500);

const gotA = (await block.innerText()).replace(/ /g, " ").trim();
const caret = await block.evaluate((el) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { hasSelection: false };
  return {
    hasSelection: true,
    collapsed: sel.isCollapsed,
    insideBlock: el.contains(sel.anchorNode),
    anchorOffset: sel.anchorOffset,
    anchorTextLength: sel.anchorNode?.textContent?.length ?? -1,
  };
});
await pageA.screenshot({ path: `${out}-after.png` });

console.log("typed   :", JSON.stringify(TYPED));
console.log("observed:", JSON.stringify(gotA));
console.log("caret   :", JSON.stringify(caret));
const textOk = gotA === TYPED;
const caretOk =
  caret.hasSelection && caret.collapsed && caret.insideBlock &&
  caret.anchorOffset === caret.anchorTextLength && caret.anchorTextLength === TYPED.length;
console.log(textOk ? "TEXT OK — exact match" : "TEXT MISMATCH");
console.log(caretOk ? "CARET OK — collapsed at end of the typed text" : "CARET NOT AT END");

// --- Convergence: a second, fresh browser context (own socket, cold load) ----
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const blockB = pageB.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`).first();
await blockB.waitFor({ state: "visible", timeout: 15000 });
const gotB = (await blockB.innerText()).replace(/ /g, " ").trim();
await pageB.screenshot({ path: `${out}-context-b.png` });
console.log("context B observed:", JSON.stringify(gotB));
const convergeOk = gotB === TYPED;
console.log(convergeOk ? "CONVERGENCE OK — second context matches" : "CONVERGENCE MISMATCH");

// --- Concurrent-echo stress: type MORE in A while B is subscribed too --------
await pageA.bringToFront();
await block.click();
await pageA.keyboard.press("End");
await pageA.keyboard.type(" — appended after reload", { delay: 8 });
await pageA.waitForTimeout(1800);
const finalA = (await block.innerText()).replace(/ /g, " ").trim();
const finalB = (await blockB.innerText()).replace(/ /g, " ").trim();
const FINAL = `${TYPED} — appended after reload`;
console.log("final A :", JSON.stringify(finalA));
console.log("final B :", JSON.stringify(finalB));
const liveOk = finalA === FINAL && finalB === FINAL;
console.log(liveOk ? "LIVE CROSS-CONTEXT OK — B received A's edit live" : "LIVE CROSS-CONTEXT MISMATCH");

await browser.close();
if (!(textOk && caretOk && convergeOk && liveOk)) process.exit(1);
console.log("ALL CHECKS PASSED");
