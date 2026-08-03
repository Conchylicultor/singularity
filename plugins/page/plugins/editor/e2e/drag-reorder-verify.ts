// Drag-to-reorder is OPTIMISTIC and lands in AUTHORITATIVE rows — single block
// and multi-selection, in a real browser.
// See research/2026-08-01-page-structural-write-contract.md (Stage 4a).
//
// `move` / `bulkMove` were fire-and-forget POSTs to bespoke endpoints, outside
// the overlay and outside the page's write order — their eslint-disables read
// *"drag again to fix"*, which is what a user had to do whenever a drag raced a
// keystroke. They are now `BlockOp`s, so a drag renders instantly and takes its
// place in the stream like every other structural edit.
//
// Phases:
//   A. drag ONE block down: it lands where it was dropped, in server truth
//   B. move a MULTI-SELECTION (Alt+Shift+Arrow): the run moves as one rigid
//      body, order preserved, in server truth
//   C. Cmd+Z / Cmd+Shift+Z: each gesture is ONE undo entry, and its inverse lands
//   D. optimism: with the op endpoint stalled 4s the reorder is on screen long
//      before the server could answer, from ONE op POST, and the confirming push
//      neither duplicates nor reverts it
//
// PRE-EXISTING DEFECT, deliberately not encoded as a spec here: DRAGGING a
// multi-selection never reaches the bulk path in a real browser. `mouse.down()`
// on the gutter drag handle focuses that <button>, and `useBlockSelection`'s
// `onFocusCapture` clears the selection for any focus target that is not the
// container itself — so by the time dnd-kit fires `onDragStart` the selection is
// empty and the gesture degrades to a single-block move. Measured (selection
// count 2 -> 2 on hover -> 0 on mouse-down), and unrelated to the write path, so
// phase B drives `bulkMove` through the keyboard nudge, which is its one live
// caller today.
//
// Usage: bun plugins/page/plugins/editor/e2e/drag-reorder-verify.ts [--base <url>] [--headed]
import {
  baseUrl,
  report,
  stallRoute,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { editableBlocks, openBlankPage } from "./support/blank-page";
import { blockSelectionDriver } from "./support/block-selection";

const base = baseUrl();
const r = report();

/** How long the server is held before answering the drag's op POST (phase D). */
const STALL_MS = 4000;
/** Steps the pointer takes between grab and drop — dnd-kit needs real movement. */
const DRAG_STEPS = 12;

await withBrowser(async (h) => {
  const { page } = await h.session();
  const { enterBlockSelection } = blockSelectionDriver(page, r);

  const blockTexts = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map((el) =>
        (el.textContent ?? "").trim(),
      ),
    );

  /** The page's rows as the SERVER holds them, in document (rank) order. */
  const serverTexts = (pageId: string): Promise<string[]> =>
    page.evaluate(async (id) => {
      const res = await fetch(`/api/pages/${id}/blocks`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`GET blocks -> ${res.status}`);
      const rows = (await res.json()) as { rank: string; data: { text?: unknown } }[];
      const plain = (text: unknown): string => {
        if (typeof text === "string") return text.trim();
        if (Array.isArray(text)) {
          return text
            .map((run) => (typeof run === "object" && run !== null ? String((run as { text?: unknown }).text ?? "") : ""))
            .join("")
            .trim();
        }
        return "";
      };
      return [...rows]
        .sort((x, y) => (String(x.rank) < String(y.rank) ? -1 : 1))
        .map((b) => plain(b.data.text));
    }, pageId);

  /**
   * Drag the row at `from` onto the row at `to`, dropping in its lower half so
   * the editor resolves an "after" zone. The handle only becomes hoverable once
   * its row is hovered (the gutter controls are `pointer-events-none` at rest),
   * so the pointer moves onto the row first.
   */
  const dragRow = async (from: number, to: number): Promise<number> => {
    const rowBox = async (i: number) => {
      const box = await page.locator("[data-block-id]").nth(i).boundingBox();
      if (!box) throw new Error(`row ${i} has no box`);
      return box;
    };
    const src = await rowBox(from);
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.waitForTimeout(200);

    const handle = page
      .locator("[data-block-id]")
      .nth(from)
      .getByLabel("Reorder or open block actions");
    const hb = await handle.boundingBox();
    if (!hb) throw new Error(`row ${from} has no drag handle`);
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    // PointerSensor needs >4px before the drag starts at all.
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 8, { steps: 3 });

    const dst = await rowBox(to);
    const dropY = dst.y + dst.height * 0.75; // lower half ⇒ "after"
    await page.mouse.move(hb.x + hb.width / 2, dropY, { steps: DRAG_STEPS });
    await page.waitForTimeout(200);
    await page.mouse.up();
    // The drop instant, NOT the grab: the gesture itself takes ~2s of scripted
    // pointer movement, and timing the optimism from before it would measure the
    // script rather than the overlay.
    return Date.now();
  };

  // ---- Fixture: alpha / bravo / charlie / delta ------------------------------
  const { pageId } = await openBlankPage(page, base, { settleMs: 3000 });
  for (const word of ["alpha", "bravo", "charlie", "delta"]) {
    await page.keyboard.type(word);
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2000); // the doc→data.text projection (~1s)
  r.eq("setup: four typed blocks", await blockTexts(), [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "",
  ]);

  // ---- A: one block ----------------------------------------------------------
  await dragRow(0, 2); // alpha, dropped after charlie
  await page.waitForTimeout(2500);
  const afterA = ["bravo", "charlie", "alpha", "delta", ""];
  r.eq("A: the dragged block landed after its drop target", await blockTexts(), afterA);
  r.eq("A: ... and in AUTHORITATIVE rows, not just the overlay", await serverTexts(pageId), afterA);

  // ---- B: a multi-selection --------------------------------------------------
  // bravo + charlie as one run, nudged below alpha. The selection must move as a
  // rigid body: its internal order survives and nothing else re-ranks — the
  // `bulkMove` op's whole contract.
  await enterBlockSelection("B", 0, "Shift+ArrowDown");
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await page.waitForTimeout(2500);
  const afterB = ["alpha", "bravo", "charlie", "delta", ""];
  r.eq("B: the selection moved as one body, order preserved", await blockTexts(), afterB);
  r.eq("B: ... in AUTHORITATIVE rows", await serverTexts(pageId), afterB);

  // ---- C: one gesture is ONE undo entry --------------------------------------
  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(2500);
  r.eq("C: Cmd+Z reverses the whole multi-block move at once", await blockTexts(), afterA);
  await page.keyboard.press("Meta+Shift+z");
  await page.waitForTimeout(2500);
  r.eq("C: Cmd+Shift+Z replays it", await blockTexts(), afterB);
  r.eq("C: ... and server truth followed the redo", await serverTexts(pageId), afterB);

  // ---- D: optimism, on a fresh page ------------------------------------------
  // Latency alone proves nothing on a fast localhost, so stall the op endpoint
  // and assert the reorder is on screen well before the server could answer.
  // Only a genuine optimistic overlay passes — this is the behaviour change the
  // two `drag again to fix` disables used to deny.
  const fresh = await openBlankPage(page, base, { settleMs: 3000 });
  for (const word of ["one", "two", "three"]) {
    await page.keyboard.type(word);
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2000);

  const opRoute = await stallRoute(page, "**/api/pages/*/blocks/op", { ms: STALL_MS });
  const t0 = await dragRow(0, 1); // "one" after "two"; the clock starts at the DROP
  const want = ["two", "one", "three", ""];

  let renderedAt = -1;
  while (Date.now() - t0 < STALL_MS) {
    if (JSON.stringify(await blockTexts()) === JSON.stringify(want)) {
      renderedAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(20);
  }
  r.ok(
    `D: the reorder rendered before the server answered (${renderedAt}ms vs a ${STALL_MS}ms stall)`,
    renderedAt >= 0 && renderedAt < STALL_MS / 2,
  );
  r.eq("D: the whole drag was ONE op POST", opRoute.count, 1);

  await page.waitForTimeout(STALL_MS + 3000);
  r.eq("D: the confirming push neither reverts nor duplicates it", await blockTexts(), want);
  r.eq("D: ... and server truth agrees", await serverTexts(fresh.pageId), want);
  r.eq("D: still exactly one op POST after the push", opRoute.count, 1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await editableBlocks(page).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(3000);
  r.eq("D: the reorder survives a reload", await blockTexts(), want);

  r.finish();
});
