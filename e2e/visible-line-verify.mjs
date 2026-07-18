// Verifies the "visible-line" Enter/Backspace invariants documented in
// plugins/page/plugins/editor/CLAUDE.md ("Visible-line invariants (Enter /
// Backspace)") end-to-end in a real browser:
//
//  A. Split-with-children adoption — splitting a block that has visible
//     children hands the children to the TAIL, not the head.
//  B. Backspace ladder on a nested bullet — marker (convertTo) -> indentation
//     (outdent) -> line break (merge), in that order.
//  C. Empty-Enter escape ladder on a nested bullet — indentation (outdent)
//     first, then the type (convertTo).
//  D. Checked to-do split (smoke) — `dataOnSplit` yields an unchecked tail.
//
// Modeled closely on e2e/crdt-split-merge-verify.mjs (page creation, block
// locating/typing helpers, DOM-structure assertions).
//
// Usage: bun e2e/visible-line-verify.mjs --base http://<wt>.localhost:9000 --out /tmp/visible-line
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/visible-line");
if (!base) {
  console.error("Usage: bun e2e/visible-line-verify.mjs --base <url> [--out <path>]");
  process.exit(2);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "OK " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

// Poll the base URL until the backend serves (build/boot may still be finishing).
async function waitForServer(url, deadlineMs) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

console.log(`waiting for ${base} ...`);
const up = await waitForServer(base, 60_000);
check("server is serving", up);
if (!up) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}

const browser = await chromium.launch();

// BLOCK_GUTTER / BLOCK_INDENT from plugins/page/plugins/editor/web/internal/page-column.ts
const BLOCK_GUTTER = 64;
const BLOCK_INDENT = 24;

/** Open a fresh blank page in a new browser context/tab; returns {ctx, page, pageUrl}. */
async function openBlankPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
  await page.goto(`${base}/pages`);
  await page.waitForTimeout(4000);
  await page.getByText("Blank page", { exact: true }).first().click();
  await page.waitForTimeout(3000);
  const pageUrl = page.url();
  const block = page.locator('[data-block-id] [contenteditable="true"]').first();
  await block.waitFor({ state: "visible", timeout: 10000 });
  await block.click();
  return { ctx, page, pageUrl };
}

/**
 * Flat, document-ordered snapshot of every text-bearing block row: id, visible
 * text, indent depth (derived from the row's own `paddingLeft` inline style —
 * there is no `data-depth` attribute; see block-row.tsx), whether a bullet
 * marker ("•") is currently rendered, and to-do checkbox state if any.
 */
async function getRows(page) {
  return page.evaluate(
    ({ gutter, indent }) => {
      const rows = [...document.querySelectorAll("[data-block-id]")].filter((el) =>
        el.querySelector('[contenteditable="true"]'),
      );
      return rows.map((el) => {
        const paddingLeft = parseFloat(el.style.paddingLeft || "0");
        const depth = Math.round((paddingLeft - gutter) / indent);
        const markerSpan = [...el.querySelectorAll('span[aria-hidden="true"]')].find(
          (s) => s.textContent === "•",
        );
        const checkbox = el.querySelector('input[type="checkbox"]');
        const editable = el.querySelector('[contenteditable="true"]');
        return {
          id: el.getAttribute("data-block-id"),
          text: (editable?.textContent ?? "").trim(),
          depth,
          hasBulletMarker: !!markerSpan,
          checked: checkbox ? checkbox.checked : null,
        };
      });
    },
    { gutter: BLOCK_GUTTER, indent: BLOCK_INDENT },
  );
}

function editableFor(page, blockId) {
  return page.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`).first();
}

/**
 * Click near an editable's left edge to approximate caret offset 0, then
 * verify+correct via ArrowLeft: a click's "nearest position" hit-test can
 * land AFTER the first character when that glyph is narrow (e.g. "i"), even
 * though the same x offset lands at true offset 0 for a wide glyph (e.g.
 * "A"/"d") — confirmed by a false failure in scenario B where Backspace ate
 * the "i" of "item" (offset 1), not the marker (offset 0).
 */
async function caretToStart(page, editable) {
  await editable.click({ position: { x: 2, y: 12 } });
  await page.waitForTimeout(200);
  for (let guard = 0; guard < 20; guard++) {
    const offset = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1);
    if (offset <= 0) break;
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(40);
  }
}

// =============================================================================
// A. Split-with-children adoption
// =============================================================================
console.log("\n=== Scenario A: split-with-children adoption ===");
{
  const { ctx, page } = await openBlankPage();
  const first = page.locator('[data-block-id] [contenteditable="true"]').first();
  const firstId = await first.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));

  await first.click();
  await page.keyboard.type("AAACCC", { delay: 20 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.keyboard.type("BBB", { delay: 20 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Tab"); // indent BBB under AAACCC
  await page.waitForTimeout(800);

  const beforeSplit = await getRows(page);
  console.log("before split:", JSON.stringify(beforeSplit));
  check("A: setup — two rows (AAACCC, BBB@depth1)", beforeSplit.length === 2, `count=${beforeSplit.length}`);
  check("A: setup — BBB indented under AAACCC", beforeSplit[1]?.depth === 1, `depth=${beforeSplit[1]?.depth}`);

  // Caret to start of AAACCC, then 3x ArrowRight -> between "AAA" and "CCC".
  const head = editableFor(page, firstId);
  await caretToStart(page, head);
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/a-split-with-children.png` });

  const afterSplit = await getRows(page);
  console.log("after split:", JSON.stringify(afterSplit));
  check("A: three rows after split", afterSplit.length === 3, `count=${afterSplit.length}`);
  if (afterSplit.length === 3) {
    check("A: row0 = AAA @ depth0", afterSplit[0].text === "AAA" && afterSplit[0].depth === 0, JSON.stringify(afterSplit[0]));
    check(
      "A: row1 = CCC @ depth0 (immediately after AAA, not indented)",
      afterSplit[1].text === "CCC" && afterSplit[1].depth === 0,
      JSON.stringify(afterSplit[1]),
    );
    check(
      "A: row2 = BBB @ depth1 (now nested under CCC, by document order)",
      afterSplit[2].text === "BBB" && afterSplit[2].depth === 1,
      JSON.stringify(afterSplit[2]),
    );
  }

  await ctx.close();
}

// =============================================================================
// B. Backspace ladder on a nested bullet
// =============================================================================
console.log("\n=== Scenario B: Backspace ladder (marker -> outdent -> merge) ===");
{
  const { ctx, page } = await openBlankPage();
  const first = page.locator('[data-block-id] [contenteditable="true"]').first();
  await first.click();
  await page.keyboard.type("parent", { delay: 20 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.keyboard.press("Tab"); // indent new block under "parent"
  await page.waitForTimeout(400);
  await page.keyboard.type("* item", { delay: 20 }); // "* " markdown prefix -> bulleted-list
  await page.waitForTimeout(600);

  let rows = await getRows(page);
  console.log("B setup:", JSON.stringify(rows));
  check("B: setup — two rows", rows.length === 2, `count=${rows.length}`);
  check("B: setup — item is a bullet", rows[1]?.hasBulletMarker === true, JSON.stringify(rows[1]));
  check("B: setup — item is indented (depth1)", rows[1]?.depth === 1, `depth=${rows[1]?.depth}`);
  check("B: setup — item text is 'item'", rows[1]?.text === "item", rows[1]?.text);
  const itemDepthBefore = rows[1]?.depth;

  const itemId = rows[1]?.id;
  const itemEditable = editableFor(page, itemId);
  await caretToStart(page, itemEditable);
  await page.waitForTimeout(300);

  // --- Backspace #1: marker gone, still indented ---
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/b-1-marker-gone.png` });
  rows = await getRows(page);
  console.log("B after backspace 1:", JSON.stringify(rows));
  check("B1: still two rows", rows.length === 2, `count=${rows.length}`);
  check("B1: bullet marker is GONE", rows[1]?.hasBulletMarker === false, JSON.stringify(rows[1]));
  check("B1: still indented (unchanged depth)", rows[1]?.depth === itemDepthBefore, `depth=${rows[1]?.depth}`);
  check("B1: text still 'item'", rows[1]?.text === "item", rows[1]?.text);

  // --- Backspace #2: outdents to top level ---
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/b-2-outdented.png` });
  rows = await getRows(page);
  console.log("B after backspace 2:", JSON.stringify(rows));
  check("B2: still two separate rows", rows.length === 2, `count=${rows.length}`);
  check("B2: outdented to top level (depth0)", rows[1]?.depth === 0, `depth=${rows[1]?.depth}`);
  check("B2: text still 'item'", rows[1]?.text === "item", rows[1]?.text);

  // --- Backspace #3: merges into previous line ---
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/b-3-merged.png` });
  rows = await getRows(page);
  console.log("B after backspace 3:", JSON.stringify(rows));
  check("B3: merged into one row", rows.length === 1, `count=${rows.length}`);
  check(
    "B3: merged text is 'parentitem' (or joins parent+item)",
    rows[0]?.text === "parentitem",
    rows[0]?.text,
  );

  await ctx.close();
}

// =============================================================================
// C. Empty-Enter escape ladder on a nested bullet
// =============================================================================
console.log("\n=== Scenario C: Empty-Enter escape ladder (outdent -> convertTo) ===");
{
  const { ctx, page } = await openBlankPage();
  const first = page.locator('[data-block-id] [contenteditable="true"]').first();
  await first.click();
  await page.keyboard.type("parent", { delay: 20 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.keyboard.press("Tab"); // indent new block under "parent"
  await page.waitForTimeout(400);
  await page.keyboard.type("* ", { delay: 20 }); // convert to bulleted-list, leave EMPTY
  await page.waitForTimeout(600);

  let rows = await getRows(page);
  console.log("C setup:", JSON.stringify(rows));
  check("C: setup — two rows", rows.length === 2, `count=${rows.length}`);
  check("C: setup — empty bullet, indented", rows[1]?.hasBulletMarker === true && rows[1]?.depth === 1, JSON.stringify(rows[1]));
  check("C: setup — text is empty", rows[1]?.text === "", JSON.stringify(rows[1]?.text));

  const emptyId = rows[1]?.id;
  const emptyEditable = editableFor(page, emptyId);
  await emptyEditable.click();
  await page.waitForTimeout(300);

  // --- Enter #1 (empty, depth1): outdent, keep bullet type ---
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/c-1-outdented.png` });
  rows = await getRows(page);
  console.log("C after enter 1:", JSON.stringify(rows));
  check("C1: still two rows (no split)", rows.length === 2, `count=${rows.length}`);
  check("C1: outdented to top level", rows[1]?.depth === 0, `depth=${rows[1]?.depth}`);
  check("C1: still a bullet", rows[1]?.hasBulletMarker === true, JSON.stringify(rows[1]));

  // --- Enter #2 (empty, depth0): convert to plain text, marker gone ---
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/c-2-converted.png` });
  rows = await getRows(page);
  console.log("C after enter 2:", JSON.stringify(rows));
  check("C2: still two rows (no split)", rows.length === 2, `count=${rows.length}`);
  check("C2: bullet marker GONE (converted to text)", rows[1]?.hasBulletMarker === false, JSON.stringify(rows[1]));
  check("C2: stayed at top level", rows[1]?.depth === 0, `depth=${rows[1]?.depth}`);

  await ctx.close();
}

// =============================================================================
// D. Checked to-do split (smoke)
// =============================================================================
console.log("\n=== Scenario D: checked to-do split -> unchecked tail ===");
{
  const { ctx, page } = await openBlankPage();
  const first = page.locator('[data-block-id] [contenteditable="true"]').first();
  const firstId = await first.evaluate((el) => el.closest("[data-block-id]").getAttribute("data-block-id"));
  await first.click();
  await page.keyboard.type("[] done it", { delay: 20 }); // "[] " markdown prefix -> to-do
  await page.waitForTimeout(600);

  let rows = await getRows(page);
  console.log("D setup:", JSON.stringify(rows));
  check("D: setup — one to-do row, unchecked", rows.length === 1 && rows[0]?.checked === false, JSON.stringify(rows));
  check("D: setup — text is 'done it'", rows[0]?.text === "done it", rows[0]?.text);

  // Check the checkbox.
  const checkbox = page.locator(`[data-block-id="${firstId}"] input[type="checkbox"]`).first();
  await checkbox.click();
  await page.waitForTimeout(500);
  rows = await getRows(page);
  check("D: checkbox is now checked", rows[0]?.checked === true, JSON.stringify(rows[0]));
  await page.screenshot({ path: `${out}/d-1-checked.png` });

  // Caret mid-text ("done| it") -> after "done" (4 chars) from the start.
  const editable = editableFor(page, firstId);
  await caretToStart(page, editable);
  await page.waitForTimeout(300);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/d-2-split.png` });

  rows = await getRows(page);
  console.log("D after split:", JSON.stringify(rows));
  check("D: two to-do rows after split", rows.length === 2, `count=${rows.length}`);
  check("D: head text 'done'", rows[0]?.text === "done", rows[0]?.text);
  check("D: tail text ' it' / 'it'", (rows[1]?.text ?? "").trim() === "it", JSON.stringify(rows[1]?.text));
  check("D: head STAYS checked", rows[0]?.checked === true, JSON.stringify(rows[0]));
  check("D: tail is UNCHECKED", rows[1]?.checked === false, JSON.stringify(rows[1]));

  await ctx.close();
}

await browser.close();

console.log("\n=== SUMMARY ===");
if (failures.length > 0) {
  console.log("FAILURES:", failures.join("; "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
