// Stage-3b per-block CRDT undo verification
// (research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// With per-block CRDT text (now unconditional — the flag is deleted), text edits ride the app's single document-level
// undo stack (Y.UndoManager items mirrored 1:1), and split/merge are ONE
// combined stack entry (structural patch + content-doc edit reverse together).
//
// Phases:
//  1. typing undo/redo in one block (two separate runs → two entries);
//  2. chronological interleave across two blocks + a structural split
//     (undo reverses in exact reverse chronological order; redo re-applies
//     forward — with the DOCUMENTED degradation that redoing typing into a
//     block whose creation was itself undone is a consistent no-op);
//  3. split undo/redo consistency: one Cmd+Z removes the new block AND
//     restores the origin's full pre-split content; rows checked over HTTP;
//  4. merge undo/redo consistency: one Cmd+Z restores the merged-away block
//     (row + re-seeded doc) AND un-appends the target;
//  5. convergence in a second browser context.
//
// Usage: bun e2e/crdt-undo-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/undo
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/undo");
if (!base) {
  console.error("Usage: bun e2e/crdt-undo-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const norm = (s) => s.replace(/ /g, " ").replace(/\n+$/, "");

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageA = await ctxA.newPage();
pageA.on("pageerror", (err) => console.log("PAGEERROR(A):", err.message));

await pageA.goto(`${base}/pages`);
await pageA.waitForTimeout(4000);
await pageA.getByText("Blank page", { exact: true }).first().click();
await pageA.waitForURL("**/page/**", { timeout: 15000 });
await pageA.waitForTimeout(3000);
const pageUrl = pageA.url();
console.log("page url:", pageUrl);
const pageId = new URL(pageUrl).pathname.split("/").filter(Boolean).at(-1) ?? null;
console.log("PAGE_ID:", pageId);

async function fetchRows() {
  const res = await fetch(`${base}/api/pages/${pageId}/blocks`);
  if (!res.ok) throw new Error(`blocks fetch ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => r.type !== "page");
}
const rowText = (row) => (row?.data?.text ?? []).map((r) => r.text).join("");

const editableSel = '[data-block-id] [contenteditable="true"]';
const blockA = pageA.locator(editableSel).first();
await blockA.waitFor({ state: "visible", timeout: 10000 });
const idA = await blockA.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
console.log("BLOCK_A:", idA);
const editorOf = (id) => pageA.locator(`[data-block-id="${id}"] [contenteditable="true"]`).first();
const textOf = async (id) => norm(await editorOf(id).innerText());
const blockCount = () => pageA.locator(`[data-block-id]:has([contenteditable="true"])`).count();

async function clickEnd(id) {
  const el = editorOf(id);
  const box = await el.boundingBox();
  await el.click({ position: { x: Math.max(2, box.width - 4), y: Math.min(14, box.height / 2) } });
  await pageA.waitForTimeout(250);
}
async function clickStart(id) {
  await editorOf(id).click({ position: { x: 2, y: 12 } });
  await pageA.waitForTimeout(250);
}
const undo = async (ms = 600) => {
  await pageA.keyboard.press("Meta+z");
  await pageA.waitForTimeout(ms);
};
const redo = async (ms = 600) => {
  await pageA.keyboard.press("Meta+Shift+z");
  await pageA.waitForTimeout(ms);
};

// --- Phase 1: typing undo/redo in one block ---------------------------------
await blockA.click();
await pageA.keyboard.type("alpha", { delay: 20 });
await pageA.waitForTimeout(900); // > captureTimeout → next run = new item/entry
await pageA.keyboard.type(" beta", { delay: 20 });
await pageA.waitForTimeout(1800); // flush + projection
check("P1 compose", (await textOf(idA)) === "alpha beta", await textOf(idA));

await undo();
check("P1 undo run2", (await textOf(idA)) === "alpha", await textOf(idA));
await undo();
check("P1 undo run1 (empty)", (await textOf(idA)) === "", await textOf(idA));
await redo();
check("P1 redo run1", (await textOf(idA)) === "alpha", await textOf(idA));
await redo();
check("P1 redo run2", (await textOf(idA)) === "alpha beta", await textOf(idA));
// Caret sanity: keep typing after the redos lands at the restored caret's block.
await pageA.screenshot({ path: `${out}-1-typing.png` });

// --- Phase 2: chronological interleave (A-typing / split / B-typing) --------
await pageA.waitForTimeout(900);
await clickEnd(idA);
await pageA.keyboard.press("Enter"); // split at end → new empty block B
await pageA.waitForTimeout(800);
check("P2 split created block", (await blockCount()) === 2, `count=${await blockCount()}`);
const idB = await pageA.evaluate(
  (a) =>
    [...document.querySelectorAll("[data-block-id]")]
      .filter((el) => el.querySelector('[contenteditable="true"]'))
      .map((el) => el.getAttribute("data-block-id"))
      .find((id) => id !== a) ?? null,
  idA,
);
console.log("BLOCK_B:", idB);
await pageA.keyboard.type("bravo", { delay: 20 }); // caret focused into B by the split
await pageA.waitForTimeout(900);
check("P2 typed in B", (await textOf(idB)) === "bravo", await textOf(idB));
await clickEnd(idA);
await pageA.keyboard.type(" zulu", { delay: 20 });
await pageA.waitForTimeout(1800);
check("P2 typed in A", (await textOf(idA)) === "alpha beta zulu", await textOf(idA));

// Undo chain: exact reverse chronological order.
await undo();
check("P2 undo1 reverts A-zulu", (await textOf(idA)) === "alpha beta" && (await textOf(idB)) === "bravo");
await undo();
check("P2 undo2 reverts B-bravo", (await textOf(idB)) === "" && (await textOf(idA)) === "alpha beta");
await undo();
check("P2 undo3 reverts split (B gone)", (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta");
// Redo chain forward. NOTE: redo of typing into a block whose creation was
// undone (B was deleted + recreated) is a DOCUMENTED consistent no-op — the
// per-block undo manager died with the doc.
await redo();
check("P2 redo split (B back, empty)", (await blockCount()) === 2 && (await textOf(idB)) === "");
await redo();
check("P2 redo B-typing = documented no-op", (await textOf(idB)) === "", await textOf(idB));
await redo();
check("P2 redo A-zulu", (await textOf(idA)) === "alpha beta zulu", await textOf(idA));
await pageA.screenshot({ path: `${out}-2-interleave.png` });

// --- Phase 3: split undo/redo consistency ------------------------------------
await clickStart(idB);
await pageA.keyboard.type("bravo", { delay: 20 }); // fresh entry, live generation
await pageA.waitForTimeout(2000);
check("P3 B recomposed", (await textOf(idB)) === "bravo", await textOf(idB));

await clickStart(idB);
for (let i = 0; i < 3; i++) {
  await pageA.keyboard.press("ArrowRight");
  await pageA.waitForTimeout(60);
}
await pageA.waitForTimeout(300);
await pageA.keyboard.press("Enter"); // split "bra|vo"
await pageA.waitForTimeout(1000);
const idC = await pageA.evaluate(
  (known) =>
    [...document.querySelectorAll("[data-block-id]")]
      .filter((el) => el.querySelector('[contenteditable="true"]'))
      .map((el) => el.getAttribute("data-block-id"))
      .find((id) => !known.includes(id)) ?? null,
  [idA, idB],
);
console.log("BLOCK_C:", idC);
check("P3 split DOM", (await textOf(idB)) === "bra" && idC !== null && (await textOf(idC)) === "vo");
await pageA.waitForTimeout(2500); // projection
{
  const rows = await fetchRows();
  const b = rows.find((r) => r.id === idB);
  const c = rows.find((r) => r.id === idC);
  check("P3 rows after split", rowText(b) === "bra" && rowText(c) === "vo", JSON.stringify({ b: rowText(b), c: rowText(c) }));
}

await undo(800); // ONE undo reverses rows AND docs together
check(
  "P3 undo split: C gone + B fully restored",
  (await blockCount()) === 2 && (await textOf(idB)) === "bravo",
  `count=${await blockCount()} B=${await textOf(idB)}`,
);
await pageA.waitForTimeout(2500);
{
  const rows = await fetchRows();
  const b = rows.find((r) => r.id === idB);
  const c = rows.find((r) => r.id === idC);
  check("P3 rows after undo-split", rowText(b) === "bravo" && c === undefined, JSON.stringify({ b: rowText(b), c: c ? rowText(c) : null }));
}
await pageA.screenshot({ path: `${out}-3-undo-split.png` });

await redo(800);
check(
  "P3 redo split: C back + B truncated",
  (await textOf(idB)) === "bra" && (await textOf(idC)) === "vo",
  `B=${await textOf(idB)} C=${idC ? await textOf(idC) : "?"}`,
);
await pageA.waitForTimeout(2500);
{
  const rows = await fetchRows();
  const b = rows.find((r) => r.id === idB);
  const c = rows.find((r) => r.id === idC);
  check("P3 rows after redo-split", rowText(b) === "bra" && rowText(c) === "vo", JSON.stringify({ b: rowText(b), c: c ? rowText(c) : null }));
}
await undo(800); // back to B="bravo", C gone — clean state for phase 4
check("P3 second undo-split", (await blockCount()) === 2 && (await textOf(idB)) === "bravo");
await pageA.waitForTimeout(2500);

// --- Phase 4: merge undo/redo consistency ------------------------------------
await clickStart(idB);
await pageA.keyboard.press("Backspace"); // merge B into A
await pageA.waitForTimeout(1200);
check(
  "P4 merge DOM",
  (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta zulubravo",
  `count=${await blockCount()} A=${await textOf(idA)}`,
);
await pageA.waitForTimeout(2500);
{
  const rows = await fetchRows();
  const a = rows.find((r) => r.id === idA);
  check("P4 rows after merge", rowText(a) === "alpha beta zulubravo" && rows.length === 1, JSON.stringify({ a: rowText(a), n: rows.length }));
}

await undo(1000); // ONE undo: B row+doc restored, A un-appended
check(
  "P4 undo merge: B restored + A un-appended",
  (await blockCount()) === 2 && (await textOf(idA)) === "alpha beta zulu" && (await textOf(idB)) === "bravo",
  `A=${await textOf(idA)} B=${(await blockCount()) === 2 ? await textOf(idB) : "?"}`,
);
await pageA.waitForTimeout(2500);
{
  const rows = await fetchRows();
  const a = rows.find((r) => r.id === idA);
  const b = rows.find((r) => r.id === idB);
  check("P4 rows after undo-merge", rowText(a) === "alpha beta zulu" && rowText(b) === "bravo", JSON.stringify({ a: rowText(a), b: b ? rowText(b) : null }));
}
await pageA.screenshot({ path: `${out}-4-undo-merge.png` });

await redo(1000);
check("P4 redo merge", (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta zulubravo");
await undo(1000); // final resting state: A + B
check(
  "P4 final undo-merge",
  (await blockCount()) === 2 && (await textOf(idA)) === "alpha beta zulu" && (await textOf(idB)) === "bravo",
);
await pageA.waitForTimeout(3000); // let projection + flush land for convergence/DB

// --- Phase 5: convergence in a second context --------------------------------
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on("pageerror", (err) => console.log("PAGEERROR(B):", err.message));
await pageB.goto(pageUrl);
await pageB.waitForTimeout(5000);
const aB = pageB.locator(`[data-block-id="${idA}"] [contenteditable="true"]`).first();
await aB.waitFor({ state: "visible", timeout: 15000 });
const textAB = norm(await aB.innerText());
const bB = pageB.locator(`[data-block-id="${idB}"] [contenteditable="true"]`).first();
const textBB = norm(await bB.innerText());
const countB = await pageB.locator('[data-block-id]:has([contenteditable="true"])').count();
await pageB.screenshot({ path: `${out}-5-context-b.png` });
check(
  "P5 convergence",
  textAB === "alpha beta zulu" && textBB === "bravo" && countB === 2,
  JSON.stringify({ a: textAB, b: textBB, n: countB }),
);

console.log("BLOCK_A:", idA);
console.log("BLOCK_B:", idB);
console.log("BLOCK_C:", idC);
console.log("PAGE_ID:", pageId);
console.log("PAGE_URL:", pageUrl);

await browser.close();
if (failures.length > 0) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
