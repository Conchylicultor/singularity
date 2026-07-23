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
// Usage: bun plugins/apps/plugins/pages/plugins/history/e2e/crdt-restore-verify.ts [--base <url>] [--out <path>]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  blockDocText,
  fetchBlockDoc,
  fetchBlockDocText,
} from "@plugins/page/plugins/editor-collab/e2e";
import {
  blockText,
  editableBlocks,
  openBlankPage,
} from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/crdt-restore");

interface TextRun {
  text?: string;
}
interface BlockRow {
  id: string;
  type: string;
  data?: { text?: TextRun[] };
}
interface VersionRow {
  id: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const fetchBlocks = (pageId: string): Promise<BlockRow[]> =>
  fetchJson<BlockRow[]>(`${base}/api/pages/${pageId}/blocks`);

const rowText = (row: BlockRow | undefined): string =>
  (row?.data?.text ?? []).map((run) => run.text ?? "").join("");

const V1 = "version one alpha content";
const V2_SUFFIX = " EDITED-second-version";

await withBrowser(async (h) => {
  const r = report();
  const { page: pageA } = await h.session({ label: "A" });

  const { pageUrl, pageId, block } = await openBlankPage(pageA, base, {
    settleMs: 3000,
  });
  console.log("pageId:", pageId);

  await pageA.keyboard.type(V1, { delay: 10 });
  // Snapshot debounce is 4s after the last blocksChanged; wait for the v1 snapshot.
  await pageA.waitForTimeout(8000);

  const versionsAfterV1 = await fetchJson<VersionRow[]>(
    `${base}/api/history/pages/${pageId}/versions`,
  );
  r.ok(
    "v1 snapshot recorded",
    versionsAfterV1.length >= 1,
    `versions=${versionsAfterV1.length}`,
  );

  // Edit to v2 — but restore BEFORE the next snapshot fires (4s debounce) and
  // while the projection just wrote v2 into data.text: history versions are
  // time-bucketed (~10min), so the recorded version still holds v1 while the
  // live rows/docs hold v2. This also exercises "restore right after edits".
  await block.click();
  await pageA.keyboard.press("End");
  await pageA.keyboard.type(V2_SUFFIX, { delay: 10 });
  await pageA.waitForTimeout(1800); // > projection debounce (1s), < snapshot debounce (4s)

  const versions = await fetchJson<VersionRow[]>(
    `${base}/api/history/pages/${pageId}/versions`,
  );
  const v1Version = versions[versions.length - 1];
  const v2Rows = await fetchBlocks(pageId);
  const v2Text = rowText(v2Rows.find((row) => row.type === "text"));
  r.ok(
    "live rows hold v2 before the restore",
    v2Text === V1 + V2_SUFFIX,
    JSON.stringify(v2Text),
  );

  // Pre-restore block id (will be re-minted by the restore) + its full row for
  // the stale-projection probe later.
  const preRows = await fetchBlocks(pageId);
  const preBlock = preRows.find((row) =>
    (row.data?.text ?? []).some((run) => (run.text ?? "").includes("version one")),
  );
  r.ok("pre-restore block found", !!preBlock, preBlock?.id);

  // --- RESTORE v1 while the editor is open --------------------------------------
  if (!v1Version) throw new Error("no history version recorded — nothing to restore");
  const res = await fetch(
    `${base}/api/history/pages/${pageId}/versions/${v1Version.id}/restore`,
    { method: "POST" },
  );
  r.ok("restore endpoint 2xx", res.ok, `status=${res.status}`);

  // Let the push land, editors remount, docs re-seed, projection settle.
  await pageA.waitForTimeout(4000);
  await snap(pageA, out, "restored");

  // The OPEN editor shows the restored text.
  const domTexts = await Promise.all(
    (await editableBlocks(pageA).all()).map(blockText),
  );
  r.ok(
    "open editor shows v1 text",
    JSON.stringify(domTexts) === JSON.stringify([V1]),
    JSON.stringify(domTexts),
  );

  // Rows: fresh id, restored data.text; the old id is gone.
  const rows = await fetchBlocks(pageId);
  const contentRows = rows.filter((row) => row.type === "text");
  r.ok(
    "exactly one restored text row",
    contentRows.length === 1,
    `rows=${contentRows.length}`,
  );
  const restored = contentRows[0];
  const restoredText = rowText(restored);
  r.ok("restored data.text is v1", restoredText === V1, JSON.stringify(restoredText));
  r.ok(
    "restored row has a FRESH id",
    restored?.id !== preBlock?.id,
    `${preBlock?.id} → ${restored?.id}`,
  );
  r.ok("old block id gone", !rows.some((row) => row.id === preBlock?.id));

  // The restored block's content doc re-seeded from the restored data.text
  // (the open editor mounted it → doc-init).
  if (!restored) throw new Error("no restored text row to inspect");
  const docRow = await fetchBlockDoc(base, restored.id);
  r.ok("restored block has a page_block_docs row", !!docRow);
  if (docRow) {
    r.ok(
      "doc state matches v1",
      blockDocText(docRow.state).trim() === V1,
      blockDocText(docRow.state),
    );
  }

  // The old block's doc row FK-cascaded away.
  if (!preBlock) throw new Error("no pre-restore block found to probe");
  const oldDoc = await fetchBlockDoc(base, preBlock.id);
  r.ok("old block's doc row cascaded", oldDoc === undefined);

  // The open editor is LIVE on the restored doc: type into it and expect sync.
  await editableBlocks(pageA).first().click();
  await pageA.keyboard.press("End");
  await pageA.keyboard.type(" post-restore", { delay: 15 });
  await pageA.waitForTimeout(2500);
  const syncedText = await fetchBlockDocText(base, restored.id);
  r.ok(
    "editor re-bound: post-restore typing syncs",
    syncedText.trim() === `${V1} post-restore`,
    syncedText,
  );

  // Second context converges.
  const { page: pageB } = await h.session({ label: "B" });
  await pageB.goto(pageUrl);
  await pageB.waitForTimeout(5000);
  const bText = await blockText(editableBlocks(pageB).first());
  r.ok("context B converges", bText === `${V1} post-restore`, JSON.stringify(bText));
  await snap(pageB, out, "context-b");

  // --- Server-half of the resurrect race: stale updateOnly projection ----------
  // A projection flush computed against the PRE-restore rows arrives AFTER the
  // restore (the client gate can't cover in-flight requests). update-only must
  // skip the dead row — never re-create it.
  const stalePatch = {
    upserts: [
      { ...preBlock, data: { ...(preBlock.data ?? {}), text: [{ text: "ZOMBIE" }] } },
    ],
    deleteIds: [] as string[],
    updateOnly: true,
  };
  const patchRes = await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stalePatch),
  });
  r.ok(
    "stale updateOnly patch accepted (2xx)",
    patchRes.ok,
    `status=${patchRes.status}`,
  );
  const rowsAfter = await fetchBlocks(pageId);
  r.ok(
    "stale projection did NOT resurrect the old block",
    !rowsAfter.some((row) => row.id === preBlock.id),
  );
  r.ok(
    "restored row untouched by the stale patch",
    rowText(rowsAfter.find((row) => row.id === restored.id)).startsWith(V1),
  );
  // Control: WITHOUT updateOnly the same stale patch WOULD resurrect (documents
  // why the flag exists). Clean it up right after.
  const controlRes = await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...stalePatch, updateOnly: false }),
  });
  const rowsControl = await fetchBlocks(pageId);
  r.ok(
    "control: plain patch re-creates (undo-of-delete semantics intact)",
    controlRes.ok && rowsControl.some((row) => row.id === preBlock.id),
  );
  await fetch(`${base}/api/pages/${pageId}/blocks/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upserts: [], deleteIds: [preBlock.id] }),
  });

  r.finish();
});
