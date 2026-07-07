// Reopen-an-edited-block regression (per-block CRDT plan,
// research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// The bug this pins down: `connect()`'s instant pre-seed (Stage 4a) fired for
// EVERY first connect — including an existing, previously-edited block on a
// cold page load — because the "row confirmed" / "server state" signals arrive
// from PARENT effects that run after the child CollaborationPlugin's connect.
// The pre-seed (hashed from the CURRENT projected `data.text`) then merged
// with the stored doc (original seed + live-edit items under other clientIDs):
// two independent CRDT encodings of the same visible text → the paragraph
// rendered TWICE, and the projection persisted the doubled runs, compounding
// on every reopen.
//
// Scenario:
//  1. create a blank page, type a distinctive string into its text block;
//  2. wait for the doc flush AND the `data.text` projection to land;
//  3. COLD-reopen the page (a fresh browser context — a same-context reload
//     restores the persisted tab set onto the Pages landing instead of the
//     deep link, so a new context is the real "reopen" path); assert the
//     block shows the text EXACTLY ONCE — in the DOM, in `data.text`, and in
//     the decoded `page_block_docs` state;
//  4. reopen again to prove it does not compound.
//
// NOTE on reproducibility: with the CURRENT @lexical/react (0.44),
// CollaborationPlugin happens to defer provider.connect() by two internal
// commits, so the owning hook's markBlockRowConfirmed effect wins the race
// and this e2e passes even before the construction-time-discriminator fix —
// the connect-before-latch interleave is only reachable at the provider
// contract level. The failing-then-fixed reproducer for that mechanism is
// plugins/page/plugins/editor/web/__tests__/live-state-yjs-provider.test.ts;
// this e2e pins the end-to-end invariant against regressions in either layer.
//
// Usage: bun e2e/crdt-reopen-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/crdt-reopen
import { chromium } from "playwright";
import { createRequire } from "node:module";

// yjs is a workspace dep of the editor plugin (not hoisted to the repo root),
// so resolve it from that package's context.
const require = createRequire(
  new URL("../plugins/page/plugins/editor/package.json", import.meta.url),
);
const Y = require("yjs");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/crdt-reopen");
if (!base) {
  console.error("Usage: bun e2e/crdt-reopen-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const TYPED = "quantum flamingo orchestra rehearsal";

/** Count non-overlapping occurrences of `needle` in `hay`. */
function countOccurrences(hay, needle) {
  let count = 0;
  let i = 0;
  for (;;) {
    const at = hay.indexOf(needle, i);
    if (at < 0) return count;
    count += 1;
    i = at + needle.length;
  }
}

async function fetchBlockText(pageId, blockId) {
  const rows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
  const row = rows.find((r) => r.id === blockId);
  const runs = row?.data?.text ?? [];
  return runs.map((r) => r.text).join("");
}

/** Decode the stored page_block_docs state to its plain text (via doc-init echo). */
async function fetchDocText(blockId) {
  // doc-init with an EMPTY update is a read: the row exists (we flushed), so
  // ON CONFLICT DO NOTHING no-ops and the response is the stored state.
  const emptyUpdate = Y.encodeStateAsUpdate(new Y.Doc());
  const res = await fetch(`${base}/api/blocks/${blockId}/doc-init`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: emptyUpdate,
  });
  if (!res.ok) throw new Error(`doc-init read failed: ${res.status}`);
  const { state } = await res.json();
  const bytes = Uint8Array.from(atob(state), (c) => c.charCodeAt(0));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  // @lexical/yjs stores content as one XmlText under the fixed key "root";
  // toString() serializes embedded paragraphs — plain text appears verbatim.
  return doc.get("root", Y.XmlText).toString();
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);

await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);
const pageUrl = page.url();
const pageId = pageUrl.split("/").filter(Boolean).at(-1);
console.log("page url:", pageUrl);

const block = page.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
const blockId = await block.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
console.log("block id:", blockId);
await block.click();
await page.keyboard.type(TYPED, { delay: 12 });

// Wait for the doc-update flush (300ms debounce) AND the data.text projection
// (1s debounce) to land server-side before reloading.
let projected = "";
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  projected = await fetchBlockText(pageId, blockId);
  if (projected === TYPED) break;
}
check("projection wrote data.text before reload", projected === TYPED, JSON.stringify(projected));
await page.screenshot({ path: `${out}-before-reload.png` });

// Close the writer context so the reopen is genuinely cold (no shared
// leader-elected socket, no in-memory doc registry).
await ctx.close();

/** Cold-open the page in a fresh context and run the exactly-once checks. */
async function reopenAndVerify(round) {
  const freshCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const freshPage = await freshCtx.newPage();
  freshPage.on("pageerror", (err) => console.log(`PAGEERROR(reopen ${round}):`, err.message));
  await freshPage.goto(pageUrl);
  const blockAfter = freshPage
    .locator(`[data-block-id="${blockId}"] [contenteditable="true"]`)
    .first();
  await blockAfter.waitFor({ state: "visible", timeout: 20000 });
  // Let any (buggy) duplicated projection flush too, so data.text reflects
  // what the reopened editor now holds.
  await freshPage.waitForTimeout(3000);
  const dom = (await blockAfter.innerText()).replace(/\u00a0/g, " ").trim();
  await freshPage.screenshot({ path: `${out}-after-reopen-${round}.png` });
  console.log(`DOM after reopen ${round}:`, JSON.stringify(dom));
  check(`DOM shows the text exactly once after reopen ${round}`, dom === TYPED, JSON.stringify(dom));

  const dataText = await fetchBlockText(pageId, blockId);
  check(
    `data.text is the single copy after reopen ${round}`,
    dataText === TYPED,
    JSON.stringify(dataText),
  );

  const docText = await fetchDocText(blockId);
  check(
    `page_block_docs state decodes to a single copy after reopen ${round}`,
    countOccurrences(docText, TYPED) === 1,
    JSON.stringify(docText),
  );
  await freshCtx.close();
}

await reopenAndVerify(1);
await reopenAndVerify(2); // must not compound

await browser.close();
if (failures.length > 0) {
  console.log(`\n${failures.length} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
