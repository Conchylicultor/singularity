// Stage-4a doc-init ordering-race verification
// (research/2026-07-07-page-per-block-crdt-plan-b.md, Task 1).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a blank page and drive FAST create-block + split-block sequences —
//     Enter immediately followed by typing in the freshly-minted block, i.e.
//     the editor mounts from the optimistic overlay BEFORE the structural op's
//     POST has created the `_blocks` row (the exact doc-init FK race);
//  2. assert NO doc-init / doc-update / blocks request ever returns >= 400
//     (previously: FK violation → 500 → wedged initStarted latch);
//  3. assert EVERY block ends up with a `page_block_docs` row whose decoded
//     Yjs state matches the DOM text (the latch never wedged — buffered
//     keystrokes flushed after the gated seed);
//  4. assert `data.text` (the projection) converges to the same text;
//  5. open a second browser context and assert it converges.
//
// Usage: bun e2e/crdt-newblock-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/crdt-newblock
import { chromium } from "playwright";
import * as Y from "../plugins/page/plugins/editor/node_modules/yjs/dist/yjs.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/crdt-newblock");
if (!base) {
  console.error("Usage: bun e2e/crdt-newblock-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

/** Decode a base64 `Y.encodeStateAsUpdate` state → the doc's plain text. */
function textOfStateB64(b64) {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  const root = doc.get("root", Y.XmlText);
  const paragraphs = [];
  for (const op of root.toDelta()) {
    if (op.insert instanceof Y.XmlText) {
      let text = "";
      for (const run of op.insert.toDelta()) {
        if (typeof run.insert === "string") text += run.insert;
      }
      paragraphs.push(text);
    }
  }
  return paragraphs.join("\n");
}

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();

const pageErrors = [];
pageA.on("pageerror", (err) => {
  pageErrors.push(err.message);
  console.log("PAGEERROR(A):", err.message);
});
const badResponses = [];
pageA.on("response", (res) => {
  const url = res.url();
  if (!/\/api\/(blocks|pages)/.test(url)) return;
  if (res.status() >= 400) {
    badResponses.push(`${res.status()} ${res.request().method()} ${url}`);
    console.log("BAD RESPONSE:", res.status(), res.request().method(), url);
  }
});

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);
await pageA.getByText("Blank page", { exact: true }).first().click();
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();
const pageId = pageUrl.split("/").filter(Boolean).at(-1);
console.log("page url:", pageUrl, "pageId:", pageId);

const firstBlock = pageA.locator('[data-block-id] [contenteditable="true"]').first();
await firstBlock.waitFor({ state: "visible", timeout: 10000 });
await firstBlock.click();

// --- The race: rapid Enter-then-type chains ---------------------------------
// Each Enter dispatches a split op minting a new block; typing begins in the
// new block's editor ~25ms later — faster than any human Enter→key sequence,
// and far inside the structural-op round-trip + confirm-push + doc-init window
// (the FK race Stage 4a gates). Sub-20ms after Enter a single leading char can
// still be dropped (see e2e/split-typing-window-probe.mjs) — that regime is
// beyond human input and deliberately not asserted here.
const ENTER_SETTLE_MS = 25;
const LINES = ["alpha one", "bravo two", "charlie three", "delta four"];
await pageA.keyboard.type(LINES[0], { delay: 5 });
for (const line of LINES.slice(1)) {
  await pageA.keyboard.press("Enter");
  await pageA.waitForTimeout(ENTER_SETTLE_MS);
  await pageA.keyboard.type(line, { delay: 5 });
}
// Mid-text split: caret placed mid-word, then Enter and immediate typing in
// the tail-seeded new block.
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(ENTER_SETTLE_MS);
await pageA.keyboard.type("splitXtail", { delay: 5 });
// Lexical absorbs native caret moves via selectionchange, which lags a
// zero-delay synthetic arrow burst (same caveat as crdt-split-merge-verify).
for (let i = 0; i < "Xtail".length; i++) {
  await pageA.keyboard.press("ArrowLeft");
  await pageA.waitForTimeout(50);
}
await pageA.keyboard.press("Enter");
await pageA.waitForTimeout(ENTER_SETTLE_MS);
await pageA.keyboard.type("typed-immediately-", { delay: 5 });

// Settle: flush debounce (300ms), projection debounce (1s), pushes.
await pageA.waitForTimeout(3500);
await pageA.screenshot({ path: `${out}-a.png` });

// DOM truth: every block id + its visible text, in order.
const domBlocks = await pageA.evaluate(() => {
  return [...document.querySelectorAll("[data-block-id]")]
    .map((el) => ({
      id: el.getAttribute("data-block-id"),
      text: el.querySelector('[contenteditable="true"]')?.innerText ?? null,
    }))
    .filter((b) => b.text !== null);
});
console.log("DOM blocks:", JSON.stringify(domBlocks, null, 1));

const EXPECTED = [...LINES, "split", "typed-immediately-Xtail"];
const domTexts = domBlocks.map((b) => b.text.replace(/ /g, " ").trim());
const domOk = JSON.stringify(domTexts) === JSON.stringify(EXPECTED);
console.log(domOk ? "DOM OK" : `DOM MISMATCH — expected ${JSON.stringify(EXPECTED)}`);

// Server truth 1: every block has a page_block_docs row whose decoded state
// matches the DOM (proves the seed happened AND the buffered typing flushed).
let docsOk = true;
for (const b of domBlocks) {
  const res = await fetch(`${base}/api/resources/page-block-doc?blockId=${b.id}`);
  const { value } = await res.json();
  const row = value?.[0];
  if (!row) {
    docsOk = false;
    console.log(`DOC MISSING for block ${b.id} ("${b.text}") — page_block_docs row never created`);
    continue;
  }
  const docText = textOfStateB64(row.state);
  const want = b.text.replace(/ /g, " ").trim();
  if (docText.trim() !== want) {
    docsOk = false;
    console.log(`DOC MISMATCH for block ${b.id}: doc="${docText}" dom="${want}"`);
  }
}
console.log(docsOk ? "DOCS OK — every block has a converged page_block_docs row" : "DOCS FAILED");

// Server truth 2: the data.text projection converged too.
const rows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
const rowTextById = new Map(
  rows.map((r) => [r.id, (r.data?.text ?? []).map((run) => run.text ?? "").join("")]),
);
let projOk = true;
for (const b of domBlocks) {
  const want = b.text.replace(/ /g, " ").trim();
  const got = (rowTextById.get(b.id) ?? "<row missing>").trim();
  if (got !== want) {
    projOk = false;
    console.log(`PROJECTION MISMATCH for ${b.id}: data.text="${got}" dom="${want}"`);
  }
}
console.log(projOk ? "PROJECTION OK — data.text agrees for every block" : "PROJECTION FAILED");

// Convergence: a second, fresh browser context.
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const bTexts = (
  await pageB.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map(
      (el) => el.innerText,
    ),
  )
).map((t) => t.replace(/ /g, " ").trim());
await pageB.screenshot({ path: `${out}-b.png` });
const convergeOk = JSON.stringify(bTexts) === JSON.stringify(EXPECTED);
console.log(convergeOk ? "CONVERGENCE OK" : `CONVERGENCE MISMATCH: ${JSON.stringify(bTexts)}`);

const noBad = badResponses.length === 0;
const noErrors = pageErrors.length === 0;
console.log(noBad ? "HTTP OK — no >=400 on any blocks/doc endpoint" : `HTTP FAILURES: ${badResponses.join("; ")}`);
console.log(noErrors ? "NO PAGE ERRORS" : `PAGE ERRORS: ${pageErrors.join("; ")}`);

await browser.close();
if (!(domOk && docsOk && projOk && convergeOk && noBad && noErrors)) process.exit(1);
console.log("ALL CHECKS PASSED");
