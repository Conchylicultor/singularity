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
// Usage: bun plugins/page/plugins/editor/e2e/crdt-undo-verify.ts [--base <url>] [--out /tmp/undo]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Locator } from "playwright";
import { openBlankPage } from "./support/blank-page";

const base = baseUrl();
const out = arg("out", "/tmp/undo");

const r = report();

// NOT the barrel's `blockText()`: these assertions compare against text that
// legitimately carries an interior/leading space (" zulu" typed onto "alpha
// beta"), so this normalizer strips trailing newlines only — it never trims.
const norm = (s: string): string => s.replace(/ /g, " ").replace(/\n+$/, "");

interface BlockRow {
  id: string;
  type: string;
  data?: { text?: { text: string }[] };
}

async function fetchRows(pageId: string): Promise<BlockRow[]> {
  const res = await fetch(`${base}/api/pages/${pageId}/blocks`);
  if (!res.ok) throw new Error(`blocks fetch ${res.status}`);
  const rows = (await res.json()) as BlockRow[];
  return rows.filter((row) => row.type !== "page");
}
const rowText = (row: BlockRow | undefined): string =>
  (row?.data?.text ?? []).map((run) => run.text).join("");

await withBrowser(async (h) => {
  const { page: pageA } = await h.session({ label: "A" });

  const {
    pageUrl,
    pageId,
    block: blockA,
    blockId: idA,
  } = await openBlankPage(pageA, base, { settleMs: 3000 });
  console.log("page url:", pageUrl);
  console.log("PAGE_ID:", pageId);
  console.log("BLOCK_A:", idA);

  // The block ids stay nullable on purpose: when a phase fails to find the block
  // it just created, the locator resolves to `[data-block-id="null"]` and the
  // assertion reports the miss — the pre-move behaviour, kept verbatim.
  const editorOf = (id: string | null): Locator =>
    pageA.locator(`[data-block-id="${id}"] [contenteditable="true"]`).first();
  const textOf = async (id: string | null): Promise<string> =>
    norm(await editorOf(id).innerText());
  const blockCount = (): Promise<number> =>
    pageA.locator(`[data-block-id]:has([contenteditable="true"])`).count();

  async function clickEnd(id: string | null): Promise<void> {
    const el = editorOf(id);
    const box = await el.boundingBox();
    if (!box) throw new Error(`no bounding box for block ${id}`);
    await el.click({
      position: { x: Math.max(2, box.width - 4), y: Math.min(14, box.height / 2) },
    });
    await pageA.waitForTimeout(250);
  }
  async function clickStart(id: string | null): Promise<void> {
    await editorOf(id).click({ position: { x: 2, y: 12 } });
    await pageA.waitForTimeout(250);
  }
  const undo = async (ms = 600): Promise<void> => {
    await pageA.keyboard.press("Meta+z");
    await pageA.waitForTimeout(ms);
  };
  const redo = async (ms = 600): Promise<void> => {
    await pageA.keyboard.press("Meta+Shift+z");
    await pageA.waitForTimeout(ms);
  };

  // --- Phase 1: typing undo/redo in one block ---------------------------------
  await blockA.click();
  await pageA.keyboard.type("alpha", { delay: 20 });
  await pageA.waitForTimeout(900); // > captureTimeout → next run = new item/entry
  await pageA.keyboard.type(" beta", { delay: 20 });
  await pageA.waitForTimeout(1800); // flush + projection
  r.ok("P1 compose", (await textOf(idA)) === "alpha beta", await textOf(idA));

  await undo();
  r.ok("P1 undo run2", (await textOf(idA)) === "alpha", await textOf(idA));
  await undo();
  r.ok("P1 undo run1 (empty)", (await textOf(idA)) === "", await textOf(idA));
  await redo();
  r.ok("P1 redo run1", (await textOf(idA)) === "alpha", await textOf(idA));
  await redo();
  r.ok("P1 redo run2", (await textOf(idA)) === "alpha beta", await textOf(idA));
  // Caret sanity: keep typing after the redos lands at the restored caret's block.
  await snap(pageA, out, "1-typing");

  // --- Phase 2: chronological interleave (A-typing / split / B-typing) --------
  await pageA.waitForTimeout(900);
  await clickEnd(idA);
  await pageA.keyboard.press("Enter"); // split at end → new empty block B
  await pageA.waitForTimeout(800);
  r.ok("P2 split created block", (await blockCount()) === 2, `count=${await blockCount()}`);
  const idB = await pageA.evaluate<string | null, string>(
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
  r.ok("P2 typed in B", (await textOf(idB)) === "bravo", await textOf(idB));
  await clickEnd(idA);
  await pageA.keyboard.type(" zulu", { delay: 20 });
  await pageA.waitForTimeout(1800);
  r.ok("P2 typed in A", (await textOf(idA)) === "alpha beta zulu", await textOf(idA));

  // Undo chain: exact reverse chronological order.
  await undo();
  r.ok(
    "P2 undo1 reverts A-zulu",
    (await textOf(idA)) === "alpha beta" && (await textOf(idB)) === "bravo",
  );
  await undo();
  r.ok(
    "P2 undo2 reverts B-bravo",
    (await textOf(idB)) === "" && (await textOf(idA)) === "alpha beta",
  );
  await undo();
  r.ok(
    "P2 undo3 reverts split (B gone)",
    (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta",
  );
  // Redo chain forward. NOTE: redo of typing into a block whose creation was
  // undone (B was deleted + recreated) is a DOCUMENTED consistent no-op — the
  // per-block undo manager died with the doc.
  await redo();
  r.ok("P2 redo split (B back, empty)", (await blockCount()) === 2 && (await textOf(idB)) === "");
  await redo();
  r.ok("P2 redo B-typing = documented no-op", (await textOf(idB)) === "", await textOf(idB));
  await redo();
  r.ok("P2 redo A-zulu", (await textOf(idA)) === "alpha beta zulu", await textOf(idA));
  await snap(pageA, out, "2-interleave");

  // --- Phase 3: split undo/redo consistency ------------------------------------
  await clickStart(idB);
  await pageA.keyboard.type("bravo", { delay: 20 }); // fresh entry, live generation
  await pageA.waitForTimeout(2000);
  r.ok("P3 B recomposed", (await textOf(idB)) === "bravo", await textOf(idB));

  await clickStart(idB);
  for (let i = 0; i < 3; i++) {
    await pageA.keyboard.press("ArrowRight");
    await pageA.waitForTimeout(60);
  }
  await pageA.waitForTimeout(300);
  await pageA.keyboard.press("Enter"); // split "bra|vo"
  await pageA.waitForTimeout(1000);
  const idC = await pageA.evaluate<string | null, (string | null)[]>(
    (known) =>
      [...document.querySelectorAll("[data-block-id]")]
        .filter((el) => el.querySelector('[contenteditable="true"]'))
        .map((el) => el.getAttribute("data-block-id"))
        .find((id) => !known.includes(id)) ?? null,
    [idA, idB],
  );
  console.log("BLOCK_C:", idC);
  r.ok(
    "P3 split DOM",
    (await textOf(idB)) === "bra" && idC !== null && (await textOf(idC)) === "vo",
  );
  await pageA.waitForTimeout(2500); // projection
  {
    const rows = await fetchRows(pageId);
    const b = rows.find((row) => row.id === idB);
    const c = rows.find((row) => row.id === idC);
    r.ok(
      "P3 rows after split",
      rowText(b) === "bra" && rowText(c) === "vo",
      JSON.stringify({ b: rowText(b), c: rowText(c) }),
    );
  }

  await undo(800); // ONE undo reverses rows AND docs together
  r.ok(
    "P3 undo split: C gone + B fully restored",
    (await blockCount()) === 2 && (await textOf(idB)) === "bravo",
    `count=${await blockCount()} B=${await textOf(idB)}`,
  );
  await pageA.waitForTimeout(2500);
  {
    const rows = await fetchRows(pageId);
    const b = rows.find((row) => row.id === idB);
    const c = rows.find((row) => row.id === idC);
    r.ok(
      "P3 rows after undo-split",
      rowText(b) === "bravo" && c === undefined,
      JSON.stringify({ b: rowText(b), c: c ? rowText(c) : null }),
    );
  }
  await snap(pageA, out, "3-undo-split");

  await redo(800);
  r.ok(
    "P3 redo split: C back + B truncated",
    (await textOf(idB)) === "bra" && (await textOf(idC)) === "vo",
    `B=${await textOf(idB)} C=${idC ? await textOf(idC) : "?"}`,
  );
  await pageA.waitForTimeout(2500);
  {
    const rows = await fetchRows(pageId);
    const b = rows.find((row) => row.id === idB);
    const c = rows.find((row) => row.id === idC);
    r.ok(
      "P3 rows after redo-split",
      rowText(b) === "bra" && rowText(c) === "vo",
      JSON.stringify({ b: rowText(b), c: c ? rowText(c) : null }),
    );
  }
  await undo(800); // back to B="bravo", C gone — clean state for phase 4
  r.ok("P3 second undo-split", (await blockCount()) === 2 && (await textOf(idB)) === "bravo");
  await pageA.waitForTimeout(2500);

  // --- Phase 4: merge undo/redo consistency ------------------------------------
  await clickStart(idB);
  await pageA.keyboard.press("Backspace"); // merge B into A
  await pageA.waitForTimeout(1200);
  r.ok(
    "P4 merge DOM",
    (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta zulubravo",
    `count=${await blockCount()} A=${await textOf(idA)}`,
  );
  await pageA.waitForTimeout(2500);
  {
    const rows = await fetchRows(pageId);
    const a = rows.find((row) => row.id === idA);
    r.ok(
      "P4 rows after merge",
      rowText(a) === "alpha beta zulubravo" && rows.length === 1,
      JSON.stringify({ a: rowText(a), n: rows.length }),
    );
  }

  await undo(1000); // ONE undo: B row+doc restored, A un-appended
  r.ok(
    "P4 undo merge: B restored + A un-appended",
    (await blockCount()) === 2 &&
      (await textOf(idA)) === "alpha beta zulu" &&
      (await textOf(idB)) === "bravo",
    `A=${await textOf(idA)} B=${(await blockCount()) === 2 ? await textOf(idB) : "?"}`,
  );
  await pageA.waitForTimeout(2500);
  {
    const rows = await fetchRows(pageId);
    const a = rows.find((row) => row.id === idA);
    const b = rows.find((row) => row.id === idB);
    r.ok(
      "P4 rows after undo-merge",
      rowText(a) === "alpha beta zulu" && rowText(b) === "bravo",
      JSON.stringify({ a: rowText(a), b: b ? rowText(b) : null }),
    );
  }
  await snap(pageA, out, "4-undo-merge");

  await redo(1000);
  r.ok(
    "P4 redo merge",
    (await blockCount()) === 1 && (await textOf(idA)) === "alpha beta zulubravo",
  );
  await undo(1000); // final resting state: A + B
  r.ok(
    "P4 final undo-merge",
    (await blockCount()) === 2 &&
      (await textOf(idA)) === "alpha beta zulu" &&
      (await textOf(idB)) === "bravo",
  );
  await pageA.waitForTimeout(3000); // let projection + flush land for convergence/DB

  // --- Phase 5: convergence in a second context --------------------------------
  const { page: pageB } = await h.session({ label: "B" });
  await pageB.goto(pageUrl);
  await pageB.waitForTimeout(5000);
  const aB = pageB.locator(`[data-block-id="${idA}"] [contenteditable="true"]`).first();
  await aB.waitFor({ state: "visible", timeout: 15000 });
  const textAB = norm(await aB.innerText());
  const bB = pageB.locator(`[data-block-id="${idB}"] [contenteditable="true"]`).first();
  const textBB = norm(await bB.innerText());
  const countB = await pageB.locator('[data-block-id]:has([contenteditable="true"])').count();
  await snap(pageB, out, "5-context-b");
  r.ok(
    "P5 convergence",
    textAB === "alpha beta zulu" && textBB === "bravo" && countB === 2,
    JSON.stringify({ a: textAB, b: textBB, n: countB }),
  );

  console.log("BLOCK_A:", idA);
  console.log("BLOCK_B:", idB);
  console.log("BLOCK_C:", idC);
  console.log("PAGE_ID:", pageId);
  console.log("PAGE_URL:", pageUrl);

  r.finish();
});
