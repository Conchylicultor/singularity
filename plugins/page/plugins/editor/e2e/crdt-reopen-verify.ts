// Reopen-an-edited-block regression (per-block CRDT plan,
// research/2026-07-07-page-per-block-crdt-plan-b.md).
//
// The bug this pins down: `connect()`'s instant pre-seed (Stage 4a) fired for
// EVERY first connect — including an existing, previously-edited block on a
// cold page load — because the "row confirmed" / "server state" signals arrive
// from PARENT effects that run after the child CollaborationPlugin's connect.
// The pre-seed (hashed from the CURRENT projected `data.text`) then merged
// with the stored doc (original seed + live-edit items under other clientIDs):
// two independent CRDT encodings of the same visible text → the paragraph
// rendered TWICE, and the projection persisted the doubled runs, compounding
// on every reopen.
//
// Scenario:
//  1. create a blank page, type a distinctive string into its text block;
//  2. wait for the doc flush AND the `data.text` projection to land;
//  3. COLD-reopen the page (a fresh browser context — a same-context reload
//     restores the persisted tab set onto the Pages landing instead of the
//     deep link, so a new context is the real "reopen" path); assert the
//     block shows the text EXACTLY ONCE — in the DOM, in `data.text`, and in
//     the decoded `page_block_docs` state;
//  4. reopen again to prove it does not compound.
//
// NOTE on reproducibility: with the CURRENT @lexical/react (0.44),
// CollaborationPlugin happens to defer provider.connect() by two internal
// commits, so the owning hook's markBlockRowConfirmed effect wins the race
// and this e2e passes even before the construction-time-discriminator fix —
// the connect-before-latch interleave is only reachable at the provider
// contract level. The failing-then-fixed reproducer for that mechanism is
// plugins/page/plugins/editor/web/__tests__/live-state-yjs-provider.test.ts;
// this e2e pins the end-to-end invariant against regressions in either layer.
//
// Usage: bun plugins/page/plugins/editor/e2e/crdt-reopen-verify.ts [--base <url>] [--out /tmp/crdt-reopen]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
// This script lives inside the editor plugin, which declares `yjs` as a
// dependency — so the bare specifier resolves by ordinary walk-up. (Before the
// per-plugin move this was a `createRequire` against a hardcoded
// `../plugins/page/plugins/editor/package.json` URL, which only worked because
// the old flat `e2e/` folder happened to sit beside `plugins/`.)
import * as Y from "yjs";
import { blockText, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const out = arg("out", "/tmp/crdt-reopen");

const TYPED = "quantum flamingo orchestra rehearsal";

/** Count non-overlapping occurrences of `needle` in `hay`. */
function countOccurrences(hay: string, needle: string): number {
  let count = 0;
  let i = 0;
  for (;;) {
    const at = hay.indexOf(needle, i);
    if (at < 0) return count;
    count += 1;
    i = at + needle.length;
  }
}

interface BlockRow {
  id: string;
  data?: { text?: { text: string }[] };
}

async function fetchBlockText(pageId: string, blockId: string): Promise<string> {
  const rows = (await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json()) as BlockRow[];
  const row = rows.find((r) => r.id === blockId);
  const runs = row?.data?.text ?? [];
  return runs.map((run) => run.text).join("");
}

/**
 * Decode the stored page_block_docs state to its plain text (via doc-init echo).
 *
 * Deliberately NOT `blockDocText` from `@plugins/page/plugins/editor-collab/e2e`:
 * that reads through the live-state resource endpoint and concatenates the
 * paragraph deltas, whereas this test reads through the doc-init echo (a read
 * path it is also implicitly exercising) and asserts on the XmlText
 * serialization, so a duplicated paragraph shows up as markup too.
 */
async function fetchDocText(blockId: string): Promise<string> {
  // doc-init with an EMPTY update is a read: the row exists (we flushed), so
  // ON CONFLICT DO NOTHING no-ops and the response is the stored state.
  const emptyUpdate = Y.encodeStateAsUpdate(new Y.Doc());
  const res = await fetch(`${base}/api/blocks/${blockId}/doc-init`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: emptyUpdate,
  });
  if (!res.ok) throw new Error(`doc-init read failed: ${res.status}`);
  const { state } = (await res.json()) as { state: string };
  const bytes = Uint8Array.from(atob(state), (c) => c.charCodeAt(0));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  // @lexical/yjs stores content as one XmlText under the fixed key "root";
  // toString() serializes embedded paragraphs — plain text appears verbatim.
  return doc.get("root", Y.XmlText).toString();
}

const r = report();

await withBrowser(async (h) => {
  const { context: ctx, page } = await h.session();

  const { pageUrl, pageId, block, blockId } = await openBlankPage(page, base, {
    settleMs: 3000,
  });
  console.log("page url:", pageUrl);
  console.log("block id:", blockId);
  await block.click();
  await page.keyboard.type(TYPED, { delay: 12 });

  // Wait for the doc-update flush (300ms debounce) AND the data.text projection
  // (1s debounce) to land server-side before reloading.
  let projected = "";
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    projected = await fetchBlockText(pageId, blockId);
    if (projected === TYPED) break;
  }
  r.ok("projection wrote data.text before reload", projected === TYPED, JSON.stringify(projected));
  await snap(page, out, "before-reload");

  // Close the writer context so the reopen is genuinely cold (no shared
  // leader-elected socket, no in-memory doc registry).
  await ctx.close();

  /** Cold-open the page in a fresh context and run the exactly-once checks. */
  async function reopenAndVerify(round: number): Promise<void> {
    const { context: freshCtx, page: freshPage } = await h.session({
      label: `reopen ${round}`,
    });
    await freshPage.goto(pageUrl);
    const blockAfter = freshPage
      .locator(`[data-block-id="${blockId}"] [contenteditable="true"]`)
      .first();
    await blockAfter.waitFor({ state: "visible", timeout: 20000 });
    // Let any (buggy) duplicated projection flush too, so data.text reflects
    // what the reopened editor now holds.
    await freshPage.waitForTimeout(3000);
    const dom = await blockText(blockAfter);
    await snap(freshPage, out, `after-reopen-${round}`);
    console.log(`DOM after reopen ${round}:`, JSON.stringify(dom));
    r.ok(`DOM shows the text exactly once after reopen ${round}`, dom === TYPED, JSON.stringify(dom));

    const dataText = await fetchBlockText(pageId, blockId);
    r.ok(
      `data.text is the single copy after reopen ${round}`,
      dataText === TYPED,
      JSON.stringify(dataText),
    );

    const docText = await fetchDocText(blockId);
    r.ok(
      `page_block_docs state decodes to a single copy after reopen ${round}`,
      countOccurrences(docText, TYPED) === 1,
      JSON.stringify(docText),
    );
    await freshCtx.close();
  }

  await reopenAndVerify(1);
  await reopenAndVerify(2); // must not compound

  r.finish();
});
