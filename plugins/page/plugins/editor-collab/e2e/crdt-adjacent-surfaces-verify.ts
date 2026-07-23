// Stage-4a adjacent-surfaces verification (Task 3): with per-block CRDT text (unconditional), every
// row reader must stay fresh through the doc → data.text projection:
//  - full-text search finds freshly-typed text (content-search reindexes on
//    blocksChanged, which the projection fires);
//  - an inline [[page]] link typed into a bound editor registers a backlink;
//  - the projected data.text equals the doc text (row readers see the truth).
//
// Usage: bun plugins/page/plugins/editor-collab/e2e/crdt-adjacent-surfaces-verify.ts [--base <url>] [--out <path>]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/crdt-adjacent");

const r = report();

const TOKEN = `zebraquux${Date.now().toString(36)}`;

// Target page for the backlink, created out-of-band.
const targetTitle = `LinkTarget-${Date.now().toString(36)}`;
const createRes = await fetch(`${base}/api/blocks`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ parentId: null, type: "page", data: { title: targetTitle } }),
});
const target = (await createRes.json()) as { id?: string };
const targetId = target.id;
r.ok("target page created", createRes.ok && !!targetId, targetId);

await withBrowser(async (h) => {
  const { page } = await h.session();

  const { pageId, blockId } = await openBlankPage(page, base, { settleMs: 3000 });
  console.log("editing pageId:", pageId, "backlink target:", targetId);

  await page.keyboard.type(`searchable ${TOKEN} content with a link `, { delay: 10 });

  // Inline page link via the [[ typeahead — Enter picks the ACTIVE (first)
  // option, same proven pattern as crdt-split-merge-verify.ts (filter-typing
  // into the typeahead is flaky under synthetic input). Whichever page gets
  // picked, its id is read back from the projected token below.
  await page.keyboard.type("[[", { delay: 30 });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await snap(page, out, "typed");

  // Projection debounce is 1s; reindex + backlinks ride blocksChanged after it.
  await page.waitForTimeout(3500);

  // 1. data.text projection freshness.
  const rows = (await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json()) as {
    id: string;
    data?: { text?: { text?: string }[] };
  }[];
  const row = rows.find((candidate) => candidate.id === blockId);
  const rowText = (row?.data?.text ?? []).map((run) => run.text ?? "").join("");
  r.ok(
    "projected data.text contains the typed token",
    rowText.includes(TOKEN),
    JSON.stringify(rowText),
  );
  const linkMatch = rowText.match(/\[\[([^\]:]+)\]\]/);
  r.ok(
    "projected data.text contains a [[page]] token",
    !!linkMatch,
    JSON.stringify(rowText),
  );
  const linkedId = linkMatch?.[1] ?? targetId;

  // 2. Full-text search finds the fresh text.
  const search = (await (
    await fetch(`${base}/api/search?q=${TOKEN}`)
  ).json()) as unknown[];
  r.ok(
    "search finds the freshly-typed token",
    Array.isArray(search) && search.some((hit) => JSON.stringify(hit).includes(pageId)),
    `hits=${search.length}`,
  );

  // 3. Backlinks index registered the link (for whichever page was picked).
  const backlinks = (await (
    await fetch(`${base}/api/resources/page-backlinks?pageId=${linkedId}`)
  ).json()) as { value?: unknown[] };
  const backlinkRows = backlinks.value ?? [];
  r.ok(
    "backlink registered for the linked page",
    backlinkRows.some((b) => JSON.stringify(b).includes(pageId)),
    JSON.stringify(backlinkRows),
  );

  // Clean up the target page.
  await fetch(`${base}/api/blocks/${targetId}`, { method: "DELETE" });
  r.finish();
});
