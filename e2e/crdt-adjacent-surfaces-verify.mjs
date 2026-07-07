// Stage-4a adjacent-surfaces verification (Task 3): with per-block CRDT text (unconditional), every
// row reader must stay fresh through the doc → data.text projection:
//  - full-text search finds freshly-typed text (content-search reindexes on
//    blocksChanged, which the projection fires);
//  - an inline [[page]] link typed into a bound editor registers a backlink;
//  - the projected data.text equals the doc text (row readers see the truth).
//
// Usage: bun e2e/crdt-adjacent-surfaces-verify.mjs --base <url> [--out <path>]
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const base = arg("base");
const out = arg("out", "/tmp/crdt-adjacent");
if (!base) {
  console.error("Usage: bun e2e/crdt-adjacent-surfaces-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const TOKEN = `zebraquux${Date.now().toString(36)}`;

// Target page for the backlink, created out-of-band.
const targetTitle = `LinkTarget-${Date.now().toString(36)}`;
const createRes = await fetch(`${base}/api/blocks`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ parentId: null, type: "page", data: { title: targetTitle } }),
});
const target = await createRes.json();
check("target page created", createRes.ok && !!target.id, target.id);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.goto(`${base}/pages`);
await page.waitForTimeout(4000);
await page.getByText("Blank page", { exact: true }).first().click();
await page.waitForTimeout(3000);
const pageId = page.url().split("/").filter(Boolean).at(-1);
console.log("editing pageId:", pageId, "backlink target:", target.id);

const block = page.locator('[data-block-id] [contenteditable="true"]').first();
await block.waitFor({ state: "visible", timeout: 10000 });
const blockId = await block.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
await block.click();
await page.keyboard.type(`searchable ${TOKEN} content with a link `, { delay: 10 });

// Inline page link via the [[ typeahead — Enter picks the ACTIVE (first)
// option, same proven pattern as crdt-split-merge-verify.mjs (filter-typing
// into the typeahead is flaky under synthetic input). Whichever page gets
// picked, its id is read back from the projected token below.
await page.keyboard.type("[[", { delay: 30 });
await page.waitForTimeout(1200);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-typed.png` });

// Projection debounce is 1s; reindex + backlinks ride blocksChanged after it.
await page.waitForTimeout(3500);

// 1. data.text projection freshness.
const rows = await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json();
const row = rows.find((r) => r.id === blockId);
const rowText = (row?.data?.text ?? []).map((r) => r.text ?? "").join("");
check("projected data.text contains the typed token", rowText.includes(TOKEN), JSON.stringify(rowText));
const linkMatch = rowText.match(/\[\[([^\]:]+)\]\]/);
check("projected data.text contains a [[page]] token", !!linkMatch, JSON.stringify(rowText));
const linkedId = linkMatch?.[1] ?? target.id;

// 2. Full-text search finds the fresh text.
const search = await (await fetch(`${base}/api/search?q=${TOKEN}`)).json();
check(
  "search finds the freshly-typed token",
  Array.isArray(search) && search.some((hit) => JSON.stringify(hit).includes(pageId)),
  `hits=${search.length}`,
);

// 3. Backlinks index registered the link (for whichever page was picked).
const backlinks = await (await fetch(`${base}/api/resources/page-backlinks?pageId=${linkedId}`)).json();
const backlinkRows = backlinks.value ?? [];
check(
  "backlink registered for the linked page",
  backlinkRows.some((b) => JSON.stringify(b).includes(pageId)),
  JSON.stringify(backlinkRows),
);

await browser.close();
// Clean up the target page.
await fetch(`${base}/api/blocks/${target.id}`, { method: "DELETE" });
if (failures > 0) {
  console.log(`FAILURES: ${failures}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
