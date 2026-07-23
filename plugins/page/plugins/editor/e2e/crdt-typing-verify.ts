// Stage-2 per-block CRDT verification (research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a blank page, focus its empty text block;
//  2. type a multi-word string FAST, in bursts, so debounced doc-update flushes
//     and their live-state echoes land MID-typing (the exact trigger of the old
//     "Generalization of Notion" → "Generationlization of No" scramble);
//  3. assert the final text is exactly what was typed and the caret sat at the
//     very end the whole time;
//  4. open the same page in a SECOND browser context and assert it converges to
//     the same text (server round-trip through doc-update → page_block_docs →
//     blockContentResource).
//
// Usage: bun plugins/page/plugins/editor/e2e/crdt-typing-verify.ts [--base <url>] [--out /tmp/crdt]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { blockText, caretState, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const out = arg("out", "/tmp/crdt");
const r = report();

const TYPED = "Generalization of Notion via per-block CRDT typing";

await withBrowser(async (h) => {
  const { page: pageA } = await h.session({ label: "A" });

  // Create a fresh blank page from the landing quick-create tile; the blank page
  // ships one empty text block, already focused.
  const doc = await openBlankPage(pageA, base, { settleMs: 3000 });
  const pageUrl = doc.pageUrl;
  console.log("page url:", pageUrl);

  const block = doc.block;
  const blockId = doc.blockId;
  console.log("block id:", blockId);
  await snap(pageA, out, "before");

  // Type in fast bursts with pauses > the 300ms flush debounce, so the echo of
  // each flushed doc-update lands WHILE the next burst is being typed.
  const words = TYPED.split(" ");
  const bursts = [
    words.slice(0, 2),
    words.slice(2, 4),
    words.slice(4, 6),
    words.slice(6),
  ];
  for (const [i, burst] of bursts.entries()) {
    const chunk = (i === 0 ? "" : " ") + burst.join(" ");
    await pageA.keyboard.type(chunk, { delay: 8 }); // ~125 chars/s — fast typing
    await pageA.waitForTimeout(450); // let the debounced flush + live echo land mid-run
  }
  // Let the final flush + echo settle.
  await pageA.waitForTimeout(1500);

  const gotA = await blockText(block);
  const caret = await caretState(block);
  await snap(pageA, out, "after");

  console.log("typed   :", JSON.stringify(TYPED));
  console.log("observed:", JSON.stringify(gotA));
  console.log("caret   :", JSON.stringify(caret));
  const textOk = gotA === TYPED;
  const caretOk = Boolean(
    caret.hasSelection &&
      caret.collapsed &&
      caret.insideBlock &&
      caret.anchorOffset === caret.anchorTextLength &&
      caret.anchorTextLength === TYPED.length,
  );
  r.ok("TEXT — exact match", textOk, `observed ${JSON.stringify(gotA)}`);
  r.ok("CARET — collapsed at end of the typed text", caretOk);

  // --- Convergence: a second, fresh browser context (own socket, cold load) ----
  const { page: pageB } = await h.session({ label: "B" });
  await pageB.goto(pageUrl);
  await pageB.waitForTimeout(5000);
  const blockB = pageB
    .locator(`[data-block-id="${blockId}"] [contenteditable="true"]`)
    .first();
  await blockB.waitFor({ state: "visible", timeout: 15000 });
  const gotB = await blockText(blockB);
  await snap(pageB, out, "context-b");
  console.log("context B observed:", JSON.stringify(gotB));
  const convergeOk = gotB === TYPED;
  r.ok(
    "CONVERGENCE — second context matches",
    convergeOk,
    `observed ${JSON.stringify(gotB)}`,
  );

  // --- Concurrent-echo stress: type MORE in A while B is subscribed too --------
  await pageA.bringToFront();
  await block.click();
  await pageA.keyboard.press("End");
  await pageA.keyboard.type(" — appended after reload", { delay: 8 });
  await pageA.waitForTimeout(1800);
  const finalA = await blockText(block);
  const finalB = await blockText(blockB);
  const FINAL = `${TYPED} — appended after reload`;
  console.log("final A :", JSON.stringify(finalA));
  console.log("final B :", JSON.stringify(finalB));
  const liveOk = finalA === FINAL && finalB === FINAL;
  r.ok(
    "LIVE CROSS-CONTEXT — B received A's edit live",
    liveOk,
    `A ${JSON.stringify(finalA)} / B ${JSON.stringify(finalB)}`,
  );

  r.finish();
});
