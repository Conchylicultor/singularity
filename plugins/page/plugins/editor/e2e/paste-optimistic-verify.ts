// Paste renders OPTIMISTICALLY — verified against a deliberately stalled server.
//
// The defect: `paste` was the one editor mutation that bypassed the optimistic
// op pipeline. Every structural keystroke (split/merge/indent/outdent/insert/
// move) dispatched a `BlockOp` that the client applied through the shared
// reducer and the server confirmed; paste instead POSTed a bespoke
// `/blocks/paste` endpoint and the user saw nothing until the round-trip AND
// the live-state push landed — measured at 561-789ms for a 25-block paste, with
// a ~500ms main-thread freeze as the push mounted every new block at once.
//
// The fix makes paste a `BlockOp` like the rest: the client mints the forest's
// ids (`withMintedIds`) so both reducers agree on identity, overlays the result
// immediately, and the push becomes a confirmation.
//
// Latency alone is a weak assertion — on a fast localhost a round-trip can beat
// a slow poll. So this stalls the op endpoint for STALL_MS and asserts the
// blocks are on screen well before the server could possibly have answered.
// That is only passable by a genuine optimistic overlay.
//
// ROWS and TEXT are asserted as separate milestones, both inside the stall: a
// pasted row paints one commit before its text hydrates, so waiting for the row
// and then reading the text is a race (it lost 2 runs in 4, reading `["","",""]`)
// AND a weaker claim — "rendered before the server answered" would be satisfied
// by 13 empty boxes. `awaitDocument` makes the wait's predicate the assertion.
//
// Usage: bun plugins/page/plugins/editor/e2e/paste-optimistic-verify.ts [--url <deploy>]
import {
  report,
  stallRoute,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  blockTexts,
  editableBlocks,
  openBlankPage,
} from "./support/blank-page";
import { awaitDocument } from "./support/optimistic";
import { typeLines } from "./support/type-lines";

const r = report();

/** How long the server is held before answering the paste's op POST. */
const STALL_MS = 4000;
/** Blocks typed into the fixture, then copied and pasted as one forest. */
const N = 12;

await withBrowser(async (h) => {
  const { context, page } = await h.session();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await openBlankPage(page, { settleMs: 3000 });

  await typeLines(
    page,
    Array.from({ length: N }, (_, i) => `line ${String(i).padStart(2, "0")}`),
    { trailingEnter: true },
  );
  await page.waitForTimeout(2000); // doc -> data.text projection

  const texts = await blockTexts(page);
  r.eq("setup: the fixture typed cleanly", texts.slice(0, 3), [
    "line 00",
    "line 01",
    "line 02",
  ]);

  // ---- Select every block and copy the forest -------------------------------
  await editableBlocks(page).first().click();
  await page.waitForTimeout(500); // outlast the async focus steal before Escape
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+a");
  await page.waitForTimeout(200);

  const stolen = await page.evaluate(
    () => document.activeElement?.getAttribute("contenteditable") === "true",
  );
  r.eq(
    "block selection owns the clipboard (focus not stolen back)",
    stolen,
    false,
  );

  await page.keyboard.press("Meta+c");
  await page.waitForTimeout(400);

  // ---- Stall the write endpoint, then paste ---------------------------------
  // Only the structural-op POST is held. Everything else (live-state WS, doc
  // sync) keeps flowing, so this isolates "did the UI wait for the server".
  const opRoute = await stallRoute(page, "**/api/pages/*/blocks/op", {
    ms: STALL_MS,
  });

  // Cmd+A selected EVERY block — the N typed ones plus the trailing empty — so
  // the copied forest is `before` blocks and a correct paste doubles the doc.
  // `pasteAnchorId` anchors after the document-last selection root and the
  // selection is NOT replaced, so the forest is appended whole. Written as a
  // transform of `before` so the expectation cannot drift from the fixture.
  const before = await blockTexts(page);
  const doubled = [...before, ...before];

  const t0 = Date.now();
  await page.keyboard.press("Meta+v");

  // Two milestones, because they answer two questions and a pasted block's ROW
  // lands a beat before its TEXT does — the row from the structural overlay, the
  // text once that block's editor mounts and its content doc pre-applies the
  // seed in a passive effect. Both must beat the server, or the "optimistic"
  // claim only covers empty boxes. The wait's predicate is the assertion below,
  // so there is no second read to race (see ./support/optimistic.ts).
  const {
    rowsAt,
    textAt,
    last: optimistic,
  } = await awaitDocument(page, () => blockTexts(page), {
    grewBeyond: before.length,
    expected: doubled,
    timeoutMs: STALL_MS / 2,
    startedAt: t0,
  });

  // The deadline IS the bound, so reaching the milestone at all carries the
  // timing claim — no second comparison that could disagree with it.
  r.ok(
    `paste ROWS rendered before the server answered (${rowsAt}ms vs a ${STALL_MS}ms stall)`,
    rowsAt >= 0,
  );
  r.ok(
    `paste TEXT rendered before the server answered (${textAt}ms vs a ${STALL_MS}ms stall)`,
    textAt >= 0,
  );
  r.eq("the paste really did go through the op pipeline", opRoute.count, 1);

  // Content is correct while still unconfirmed — the overlay, not the push. The
  // WHOLE document, so a block that never hydrated cannot hide past the third.
  r.eq("the optimistic rows are the doubled document", optimistic, doubled);

  // ---- Let the server catch up; the push must CONFIRM, not duplicate --------
  // `release()` resolves once the held POST has actually been continued, so the
  // wait below covers only the server's work and the push — not a guess at how
  // much of the stall is left.
  //
  // This one stays a blind wait, deliberately: the assertion is that the push
  // changed NOTHING, and a poll-until-equal would be satisfied at t=0 by the
  // document already on screen and prove nothing. A fixed wait is only a defect
  // when it stands in for the thing being asserted.
  await opRoute.release();
  await page.waitForTimeout(3000);

  r.eq(
    "the confirming push neither duplicates nor drops the pasted blocks",
    await blockTexts(page),
    doubled,
  );
  // Releasing the stall must not have provoked a SECOND write. The count is the
  // only thing standing between "the server confirmed the paste" and "the rows
  // are still an unconfirmed overlay the never-revert policy is keeping around".
  r.eq("still exactly one op POST after the push", opRoute.count, 1);

  // A reload proves the rows really persisted with the client-minted ids — the
  // one assertion the never-revert overlay cannot fake. Wait for the DOCUMENT
  // rather than for a fixed delay: a blind timeout reads a half-painted forest
  // whenever hydration is a beat slow, which fails as loudly as a lost paste.
  await page.reload({ waitUntil: "domcontentloaded" });
  await editableBlocks(page)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  const reloaded = await awaitDocument(page, () => blockTexts(page), {
    expected: doubled,
    timeoutMs: 30_000,
    pollMs: 100, // a cold hydration, not a sub-frame race — no need to spin at 20ms
  });
  r.eq("the pasted blocks survive a reload", reloaded.last, doubled);

  await r.finish();
});
