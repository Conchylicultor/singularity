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
// Usage: bun plugins/page/plugins/editor/e2e/paste-optimistic-verify.ts [--base <url>]
import {
  baseUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { editableBlocks, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const r = report();

/** How long the server is held before answering the paste's op POST. */
const STALL_MS = 4000;
/** Blocks typed into the fixture, then copied and pasted as one forest. */
const N = 12;

await withBrowser(async (h) => {
  const { context, page } = await h.session();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await openBlankPage(page, base, { settleMs: 3000 });

  for (let i = 0; i < N; i++) {
    await page.keyboard.type(`line ${String(i).padStart(2, "0")}`);
    // Settle either side of the split — see copy-paste-verify.ts for why.
    await page.waitForTimeout(150);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000); // doc -> data.text projection

  const blockTexts = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable="true"]')].map(
        (el) => (el.textContent ?? "").trim(),
      ),
    );

  const texts = await blockTexts();
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
  r.eq("block selection owns the clipboard (focus not stolen back)", stolen, false);

  await page.keyboard.press("Meta+c");
  await page.waitForTimeout(400);

  // ---- Stall the write endpoint, then paste ---------------------------------
  // Only the structural-op POST is held. Everything else (live-state WS, doc
  // sync) keeps flowing, so this isolates "did the UI wait for the server".
  let opPosts = 0;
  await page.route("**/api/pages/*/blocks/op", async (route) => {
    opPosts++;
    await new Promise((resolve) => setTimeout(resolve, STALL_MS));
    await route.continue();
  });

  // Cmd+A selected EVERY block — the N typed ones plus the trailing empty — so
  // the copied forest is `before` blocks and a correct paste doubles the doc.
  const before = (await blockTexts()).length;
  const t0 = Date.now();
  await page.keyboard.press("Meta+v");

  // Poll for the pasted rows. A correct optimistic paste shows them on the
  // keystroke; a server-dependent one cannot beat STALL_MS.
  let renderedAt = -1;
  for (let i = 0; i < 400; i++) {
    if ((await blockTexts()).length > before) {
      renderedAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(20);
  }

  r.ok(
    `paste rendered before the server answered (${renderedAt}ms vs a ${STALL_MS}ms stall)`,
    renderedAt >= 0 && renderedAt < STALL_MS / 2,
  );
  r.eq("the paste really did go through the op pipeline", opPosts, 1);

  // Content is correct while still unconfirmed — the overlay, not the push.
  const optimistic = await blockTexts();
  r.eq(
    "the optimistic rows carry the pasted content",
    optimistic.slice(before, before + 3),
    ["line 00", "line 01", "line 02"],
  );
  r.eq("the whole forest landed at once", optimistic.length, before * 2);

  // ---- Let the server catch up; the push must CONFIRM, not duplicate --------
  await page.unroute("**/api/pages/*/blocks/op");
  await page.waitForTimeout(STALL_MS + 3000);

  const settled = await blockTexts();
  r.eq(
    "the confirming push neither duplicates nor drops the pasted blocks",
    settled.length,
    before * 2,
  );
  r.eq(
    "server truth matches what the user already saw",
    settled.slice(before, before + 3),
    ["line 00", "line 01", "line 02"],
  );

  // A reload proves the rows really persisted with the client-minted ids.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  r.eq("the pasted blocks survive a reload", (await blockTexts()).length, before * 2);

  r.finish();
});
