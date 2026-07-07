// Stage-4a offline/reconnect verification (Task 3 of the harden+validate pass).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. type into a block and let it sync;
//  2. cut the network (context.setOffline), KEEP TYPING — Yjs buffers the
//     edits locally (`pendingUpdates` re-queued on fetch failure; one
//     console.warn per episode, no unhandled rejections);
//  3. reconnect → the live-state socket reopen retries the flush push-based;
//  4. assert the full text (pre-offline + offline-typed) reaches the server
//     doc, the caret never jumped, and a second context converges.
//
// Usage: bun e2e/crdt-offline-verify.mjs --base <url> [--out <path>]
import { chromium } from "playwright";
import * as Y from "../plugins/page/plugins/editor/node_modules/yjs/dist/yjs.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const base = arg("base");
const out = arg("out", "/tmp/crdt-offline");
if (!base) {
  console.error("Usage: bun e2e/crdt-offline-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function textOfStateB64(b64) {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  const root = doc.get("root", Y.XmlText);
  let t = "";
  for (const op of root.toDelta()) {
    if (op.insert instanceof Y.XmlText) {
      for (const run of op.insert.toDelta()) if (typeof run.insert === "string") t += run.insert;
    }
  }
  return t;
}

const PRE = "online part";
const OFFLINE = " typed-while-OFFLINE and buffered locally";
const FULL = PRE + OFFLINE;

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();
const pageErrors = [];
pageA.on("pageerror", (err) => {
  pageErrors.push(err.message);
  console.log("PAGEERROR(A):", err.message);
});
const warns = [];
pageA.on("console", (m) => {
  if (m.type() === "warning" && m.text().includes("[collab]")) warns.push(m.text());
});

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);
await pageA.getByText("Blank page", { exact: true }).first().click();
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();

const block = pageA.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
const blockId = await block.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
await block.click();
await pageA.keyboard.type(PRE, { delay: 15 });
await pageA.waitForTimeout(1500); // flush + echo settle

// --- Go offline mid-edit ------------------------------------------------------
await ctxA.setOffline(true);
console.log("offline: ON");
await pageA.keyboard.type(OFFLINE, { delay: 20 });
// Let at least one flush attempt fail (300ms debounce) and buffer.
await pageA.waitForTimeout(2500);

const offlineDom = (await block.innerText()).replace(/ /g, " ").trim();
check("offline: local editor holds the full text", offlineDom === FULL, JSON.stringify(offlineDom));
const offlineCaret = await block.evaluate((el) => {
  const sel = window.getSelection();
  return sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)
    ? { at: sel.anchorOffset, len: sel.anchorNode?.textContent?.length ?? -1 }
    : null;
});
check(
  "offline: caret still at the end (no jump)",
  !!offlineCaret && offlineCaret.at === offlineCaret.len,
  JSON.stringify(offlineCaret),
);
// Server must NOT have the offline part yet.
const during = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${blockId}`)).json();
check(
  "offline: server doc does NOT yet contain the offline text",
  !textOfStateB64(during.value?.[0]?.state ?? "").includes("OFFLINE"),
);

// --- Reconnect -----------------------------------------------------------------
await ctxA.setOffline(false);
console.log("offline: OFF (reconnecting)");
// The shared live-state socket reconnects with backoff; its reopen triggers the
// provider's buffered-flush retry. Poll the SERVER (this script is a test
// harness, not app code) for up to 20s.
let synced = false;
let serverText = "";
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const res = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${blockId}`)).json();
  serverText = textOfStateB64(res.value?.[0]?.state ?? "");
  if (serverText === FULL) {
    synced = true;
    break;
  }
}
check("reconnect: buffered edits flushed to the server doc", synced, JSON.stringify(serverText));

const caretAfter = await block.evaluate((el) => {
  const sel = window.getSelection();
  return sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)
    ? { at: sel.anchorOffset, len: sel.anchorNode?.textContent?.length ?? -1 }
    : null;
});
check(
  "reconnect: caret still at the end (no jump)",
  !!caretAfter && caretAfter.at === caretAfter.len,
  JSON.stringify(caretAfter),
);
const domAfter = (await block.innerText()).replace(/ /g, " ").trim();
check("reconnect: editor text unchanged (no loss, no dupes)", domAfter === FULL, JSON.stringify(domAfter));
check("offline warning surfaced (observability)", warns.length >= 1, `${warns.length} warn(s)`);
check("no unhandled page errors during the outage", pageErrors.length === 0, pageErrors.join("; "));
await pageA.screenshot({ path: `${out}-after.png` });

// Second, fresh context converges.
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const bText = (await pageB.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`).first().innerText())
  .replace(/ /g, " ")
  .trim();
check("second context converges", bText === FULL, JSON.stringify(bText));

await browser.close();
if (failures > 0) {
  console.log(`FAILURES: ${failures}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
