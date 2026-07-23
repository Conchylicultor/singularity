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
// Usage: bun plugins/page/plugins/editor-collab/e2e/crdt-offline-verify.ts [--base <url>] [--out <path>]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { blockText, caretState, openBlankPage } from "@plugins/page/plugins/editor/e2e";
import { fetchBlockDocText } from "./support/ydoc";

const base = baseUrl();
const out = arg("out", "/tmp/crdt-offline");

const r = report();

const PRE = "online part";
const OFFLINE = " typed-while-OFFLINE and buffered locally";
const FULL = PRE + OFFLINE;

await withBrowser(async (h) => {
  const { context: ctxA, page: pageA, captured } = await h.session({ label: "A" });
  const pageErrors = captured.pageErrors;

  // A more specific signal than `captured` collects: the provider's own
  // per-episode "[collab]" warning is the observability assertion below.
  const warns: string[] = [];
  pageA.on("console", (m) => {
    if (m.type() === "warning" && m.text().includes("[collab]")) warns.push(m.text());
  });

  const { pageUrl, block, blockId } = await openBlankPage(pageA, base, {
    settleMs: 3000,
  });

  await pageA.keyboard.type(PRE, { delay: 15 });
  await pageA.waitForTimeout(1500); // flush + echo settle

  // --- Go offline mid-edit ------------------------------------------------------
  await ctxA.setOffline(true);
  console.log("offline: ON");
  await pageA.keyboard.type(OFFLINE, { delay: 20 });
  // Let at least one flush attempt fail (300ms debounce) and buffer.
  await pageA.waitForTimeout(2500);

  const offlineDom = await blockText(block);
  r.ok(
    "offline: local editor holds the full text",
    offlineDom === FULL,
    JSON.stringify(offlineDom),
  );
  const offlineCaret = await caretState(block);
  r.ok(
    "offline: caret still at the end (no jump)",
    offlineCaret.hasSelection &&
      !!offlineCaret.insideBlock &&
      offlineCaret.anchorOffset === offlineCaret.anchorTextLength,
    JSON.stringify(offlineCaret),
  );
  // Server must NOT have the offline part yet.
  // fetchBlockDocText (not fetchBlockDoc) — a missing row reads as "" here, the
  // same way the pre-move `res.value?.[0]?.state ?? ""` did: this assertion only
  // asks whether the offline text has landed, not whether a row exists.
  const during = await fetchBlockDocText(base, blockId);
  r.ok(
    "offline: server doc does NOT yet contain the offline text",
    !during.includes("OFFLINE"),
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
    await new Promise((resolve) => setTimeout(resolve, 500));
    serverText = await fetchBlockDocText(base, blockId);
    if (serverText === FULL) {
      synced = true;
      break;
    }
  }
  r.ok(
    "reconnect: buffered edits flushed to the server doc",
    synced,
    JSON.stringify(serverText),
  );

  const caretAfter = await caretState(block);
  r.ok(
    "reconnect: caret still at the end (no jump)",
    caretAfter.hasSelection &&
      !!caretAfter.insideBlock &&
      caretAfter.anchorOffset === caretAfter.anchorTextLength,
    JSON.stringify(caretAfter),
  );
  const domAfter = await blockText(block);
  r.ok(
    "reconnect: editor text unchanged (no loss, no dupes)",
    domAfter === FULL,
    JSON.stringify(domAfter),
  );
  r.ok("offline warning surfaced (observability)", warns.length >= 1, `${warns.length} warn(s)`);
  r.ok(
    "no unhandled page errors during the outage",
    pageErrors.length === 0,
    pageErrors.join("; "),
  );
  await snap(pageA, out, "after");

  // Second, fresh context converges.
  const { page: pageB } = await h.session({ label: "B" });
  await pageB.goto(pageUrl);
  await pageB.waitForTimeout(5000);
  const bText = await blockText(
    pageB.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`).first(),
  );
  r.ok("second context converges", bText === FULL, JSON.stringify(bText));

  r.finish();
});
