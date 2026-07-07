// Stage-4a history-restore verification (Task 2 of the harden+validate pass).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a page, type v1 text, wait for the history snapshot (4s debounce);
//  2. edit to v2 text, wait for a second snapshot;
//  3. with the editor OPEN, restore the v1 version via the history engine
//     endpoint (the same call the Version-history dialog makes);
//  4. assert the OPEN editor re-binds to the restored text (fresh block ids —
//     `replacePageContent` re-mints; old docs FK-cascade; new docs re-seed
//     from the restored `data.text`);
//  5. assert `page_block_docs` and `data.text` agree for every restored block;
//  6. assert a SECOND browser context converges;
//  7. server-half of the resurrect race: POST a stale `updateOnly` projection
//     patch for the pre-restore block id and assert it is NOT resurrected.
//
// Usage: bun e2e/crdt-restore-verify.mjs --base <url> [--out <path>]
import { chromium } from "playwright";
import * as Y from "../plugins/page/plugins/editor/node_modules/yjs/dist/yjs.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const base = arg("base");
const out = arg("out", "/tmp/crdt-restore");
if (!base) {
  console.error("Usage: bun e2e/crdt-restore-verify.mjs --base <url> [--out <path>]");
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
  const parts = [];
  for (const op of root.toDelta()) {
    if (op.insert instanceof Y.XmlText) {
      let t = "";
      for (const run of op.insert.toDelta()) if (typeof run.insert === "string") t += run.insert;
      parts.push(t);
    }
  }
  return parts.join("\n");
}

const V1 = "version one alpha content";
const V2_SUFFIX = " EDITED-second-version";

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();
pageA.on("pageerror", (err) => console.log("PAGEERROR(A):", err.message));

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);
await pageA.getByText("Blank page", { exact: true }).first().click();
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();
const pageId = pageUrl.split("/").filter(Boolean).at(-1);
console.log("pageId:", pageId);

const block = pageA.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
await block.click();
await pageA.keyboard.type(V1, { delay: 10 });
// Snapshot debounce is 4s after the last blocksChanged; wait for the v1 snapshot.
await pageA.waitForTimeout(8000);

const versionsAfterV1 = await (await fetch(`${base}/api/history/pages/${pageId}/versions`)).json();
check("v1 snapshot recorded", versionsAfterV1.length >= 1, `versions=${versionsAfterV1.length}`);

// Edit to v2 — but restore BEFORE the next snapshot fires (4s debounce) and
// while the projection just wrote v2 into data.text: history versions are
// time-bucketed (~10min), so the recorded version still holds v1 while the
// live rows/docs hold v2. This also exercises "restore right after edits".
await block.click();
await pageA.keyboard.press("End");
await pageA.keyboard.type(V2_SUFFIX, { delay: 10 });
await pageA.waitForTimeout(1800); // > projection debounce (1s), < snapshot debounce (4s)

const versions = await (await fetch(`${base}/api/history/pages/${pageId}/versions`)).json();
const v1Version = versions[versions.length - 1];
const v2Rows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
const v2Text = (v2Rows.find((r) => r.type === "text")?.data?.text ?? []).map((r) => r.text ?? "").join("");
check("live rows hold v2 before the restore", v2Text === V1 + V2_SUFFIX, JSON.stringify(v2Text));

// Pre-restore block id (will be re-minted by the restore) + its full row for
// the stale-projection probe later.
const preRows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
const preBlock = preRows.find((r) => (r.data?.text ?? []).some((run) => (run.text ?? "").includes("version one")));
check("pre-restore block found", !!preBlock, preBlock?.id);

// --- RESTORE v1 while the editor is open --------------------------------------
const res = await fetch(
  `${base}/api/history/pages/${pageId}/versions/${v1Version.id}/restore`,
  { method: "POST" },
);
check("restore endpoint 2xx", res.ok, `status=${res.status}`);

// Let the push land, editors remount, docs re-seed, projection settle.
await pageA.waitForTimeout(4000);
await pageA.screenshot({ path: `${out}-restored.png` });

// The OPEN editor shows the restored text.
const domTexts = (
  await pageA.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) => el.innerText),
  )
).map((t) => t.replace(/ /g, " ").trim());
check("open editor shows v1 text", JSON.stringify(domTexts) === JSON.stringify([V1]), JSON.stringify(domTexts));

// Rows: fresh id, restored data.text; the old id is gone.
const rows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
const contentRows = rows.filter((r) => r.type === "text");
check("exactly one restored text row", contentRows.length === 1, `rows=${contentRows.length}`);
const restored = contentRows[0];
const rowText = (restored?.data?.text ?? []).map((r) => r.text ?? "").join("");
check("restored data.text is v1", rowText === V1, JSON.stringify(rowText));
check("restored row has a FRESH id", restored?.id !== preBlock?.id, `${preBlock?.id} → ${restored?.id}`);
check("old block id gone", !rows.some((r) => r.id === preBlock?.id));

// The restored block's content doc re-seeded from the restored data.text
// (the open editor mounted it → doc-init).
const docRes = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${restored.id}`)).json();
const docRow = docRes.value?.[0];
check("restored block has a page_block_docs row", !!docRow);
if (docRow) check("doc state matches v1", textOfStateB64(docRow.state).trim() === V1, textOfStateB64(docRow.state));

// The old block's doc row FK-cascaded away.
const oldDocRes = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${preBlock.id}`)).json();
check("old block's doc row cascaded", (oldDocRes.value ?? []).length === 0);

// The open editor is LIVE on the restored doc: type into it and expect sync.
await pageA.locator('[data-block-id] [contenteditable="true"]').first().click();
await pageA.keyboard.press("End");
await pageA.keyboard.type(" post-restore", { delay: 15 });
await pageA.waitForTimeout(2500);
const docRes2 = await (await fetch(`${base}/api/resources/page-block-doc?blockId=${restored.id}`)).json();
check(
  "editor re-bound: post-restore typing syncs",
  textOfStateB64(docRes2.value?.[0]?.state ?? "").trim() === `${V1} post-restore`,
  textOfStateB64(docRes2.value?.[0]?.state ?? ""),
);

// Second context converges.
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const bText = (await pageB.locator('[data-block-id] [contenteditable="true"]').first().innerText()).replace(/ /g, " ").trim();
check("context B converges", bText === `${V1} post-restore`, JSON.stringify(bText));
await pageB.screenshot({ path: `${out}-context-b.png` });

// --- Server-half of the resurrect race: stale updateOnly projection ----------
// A projection flush computed against the PRE-restore rows arrives AFTER the
// restore (the client gate can't cover in-flight requests). update-only must
// skip the dead row — never re-create it.
const stalePatch = {
  upserts: [{ ...preBlock, data: { ...preBlock.data, text: [{ text: "ZOMBIE" }] } }],
  deleteIds: [],
  updateOnly: true,
};
const patchRes = await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(stalePatch),
});
check("stale updateOnly patch accepted (2xx)", patchRes.ok, `status=${patchRes.status}`);
const rowsAfter = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
check("stale projection did NOT resurrect the old block", !rowsAfter.some((r) => r.id === preBlock.id));
check(
  "restored row untouched by the stale patch",
  (rowsAfter.find((r) => r.id === restored.id)?.data?.text ?? []).map((r) => r.text).join("").startsWith(V1),
);
// Control: WITHOUT updateOnly the same stale patch WOULD resurrect (documents
// why the flag exists). Clean it up right after.
const controlRes = await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...stalePatch, updateOnly: false }),
});
const rowsControl = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
check(
  "control: plain patch re-creates (undo-of-delete semantics intact)",
  controlRes.ok && rowsControl.some((r) => r.id === preBlock.id),
);
await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ upserts: [], deleteIds: [preBlock.id] }),
});

await browser.close();
if (failures > 0) {
  console.log(`FAILURES: ${failures}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
