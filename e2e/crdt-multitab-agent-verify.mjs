// Stage-4a multi-tab + agent-concurrency verification (Task 3).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  A. Multi-tab: two tabs in ONE browser context (shared leader-elected
//     live-state socket) edit the same page — different blocks and the SAME
//     block — and must converge, with exactly ONE /ws/notifications socket
//     across both tabs (no per-block socket explosion).
//  B. Agent concurrency: an out-of-band writer POSTs a raw Yjs update to
//     /api/blocks/:id/doc-update (prepending a marker) WHILE the user types in
//     that same block — the edits must MERGE (no lost text) and the user's
//     caret must stay at the end of what they're typing (no jump).
//
// Usage: bun e2e/crdt-multitab-agent-verify.mjs --base <url> [--out <path>]
import { chromium } from "playwright";
import * as Y from "../plugins/page/plugins/editor/node_modules/yjs/dist/yjs.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const base = arg("base");
const out = arg("out", "/tmp/crdt-multitab");
if (!base) {
  console.error("Usage: bun e2e/crdt-multitab-agent-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// Count live-state notification sockets opened across ALL tabs of the context.
const wsOpened = [];
const tabA = await ctx.newPage();
tabA.on("websocket", (ws) => {
  if (ws.url().includes("/ws/notifications")) wsOpened.push(`A:${ws.url()}`);
});
tabA.on("pageerror", (err) => console.log("PAGEERROR(A):", err.message));

await tabA.goto(`${base}/pages`);
await tabA.waitForTimeout(4000);
await tabA.getByText("Blank page", { exact: true }).first().click();
await tabA.waitForTimeout(3000);
const pageUrl = tabA.url();

const blockA = tabA.locator('[data-block-id] [contenteditable="true"]').first();
await blockA.waitFor({ state: "visible", timeout: 10000 });
const block1Id = await blockA.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
await blockA.click();
await tabA.keyboard.type("first block from tab A", { delay: 10 });
// Second block for tab B to edit.
await tabA.keyboard.press("Enter");
await tabA.waitForTimeout(100);
await tabA.keyboard.type("second block", { delay: 10 });
await tabA.waitForTimeout(1500);

// --- Second tab, SAME context (shares the leader-elected socket) --------------
const tabB = await ctx.newPage();
tabB.on("websocket", (ws) => {
  if (ws.url().includes("/ws/notifications")) wsOpened.push(`B:${ws.url()}`);
});
tabB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await tabB.goto(pageUrl);
await tabB.waitForTimeout(4000);

// Tab B edits the SECOND block (different-block concurrency).
const blocksB = tabB.locator('[data-block-id] [contenteditable="true"]');
const blockB2 = blocksB.nth(1);
await blockB2.click();
await tabB.keyboard.press("End");
await tabB.keyboard.type(" +B", { delay: 15 });
await tabB.waitForTimeout(1500);

// Tab A edits the FIRST block concurrently-ish.
await tabA.bringToFront();
await blockA.click();
await tabA.keyboard.press("End");
await tabA.keyboard.type(" +A", { delay: 15 });
await tabA.waitForTimeout(2000);

const textsA = (
  await tabA.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) => el.innerText),
  )
).map((t) => t.replace(/ /g, " ").trim());
const textsB = (
  await tabB.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) => el.innerText),
  )
).map((t) => t.replace(/ /g, " ").trim());
const EXPECT = ["first block from tab A +A", "second block +B"];
check("tab A converged (both blocks)", JSON.stringify(textsA) === JSON.stringify(EXPECT), JSON.stringify(textsA));
check("tab B converged (both blocks)", JSON.stringify(textsB) === JSON.stringify(EXPECT), JSON.stringify(textsB));

// SAME-block concurrency across tabs: both tabs type into block 1.
await tabB.bringToFront();
await blocksB.first().click();
await tabB.keyboard.press("Home");
await tabB.keyboard.type("[B]", { delay: 15 });
await tabB.waitForTimeout(200);
await tabA.bringToFront();
await blockA.click();
await tabA.keyboard.press("End");
await tabA.keyboard.type(" [A-end]", { delay: 15 });
await tabA.waitForTimeout(2500);
const sameA = (await blockA.innerText()).replace(/ /g, " ").trim();
const sameB = (await blocksB.first().innerText()).replace(/ /g, " ").trim();
const SAME = "[B]first block from tab A +A [A-end]";
check("same-block edits merged in tab A", sameA === SAME, JSON.stringify(sameA));
check("same-block edits merged in tab B", sameB === SAME, JSON.stringify(sameB));

// One shared notifications socket for the whole context (leader-elected).
check(
  "ONE shared /ws/notifications socket across both tabs",
  wsOpened.length === 1,
  JSON.stringify(wsOpened),
);
await tabA.screenshot({ path: `${out}-multitab.png` });

// --- B. Agent concurrency ------------------------------------------------------
// Out-of-band writer: read the authoritative state, prepend a marker to the
// first paragraph via raw Yjs, POST the incremental update — while tab A types
// at the end of the same block.
const marker = "[AGENT] ";
const agentWrite = (async () => {
  const res = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${block1Id}`)).json();
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Uint8Array.from(Buffer.from(res.value[0].state, "base64")));
  const before = Y.encodeStateVector(doc);
  const root = doc.get("root", Y.XmlText);
  const firstPara = root.toDelta().find((op) => op.insert instanceof Y.XmlText)?.insert;
  if (!firstPara) throw new Error("no paragraph in block doc");
  doc.transact(() => firstPara.insert(0, marker));
  const update = Y.encodeStateAsUpdate(doc, before);
  const post = await fetch(`${base}/api/blocks/${block1Id}/doc-update`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: update,
  });
  if (!post.ok) throw new Error(`doc-update failed: ${post.status}`);
})();

// Type WHILE the agent write is in flight and its echo lands.
await tabA.keyboard.type(" typed-during-agent-write", { delay: 25 });
await agentWrite;
await tabA.waitForTimeout(2500);

const FINAL = `${marker}${SAME} typed-during-agent-write`;
const finalA = (await blockA.innerText()).replace(/ /g, " ").trim();
const finalB = (await blocksB.first().innerText()).replace(/ /g, " ").trim();
check("agent write + user typing merged (tab A)", finalA === FINAL, JSON.stringify(finalA));
check("tab B converged on the merge", finalB === FINAL, JSON.stringify(finalB));

// Caret: still collapsed at the very end of the typed text (no jump despite
// the remote prepend shifting every offset).
const caret = await blockA.evaluate((el) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return {
    inBlock: el.contains(sel.anchorNode),
    collapsed: sel.isCollapsed,
    at: sel.anchorOffset,
    len: sel.anchorNode?.textContent?.length ?? -1,
  };
});
check(
  "caret pinned to the end of the user's text (no jump)",
  !!caret && caret.inBlock && caret.collapsed && caret.at === caret.len,
  JSON.stringify(caret),
);
await tabA.screenshot({ path: `${out}-agent.png` });

await browser.close();
if (failures > 0) {
  console.log(`FAILURES: ${failures}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
