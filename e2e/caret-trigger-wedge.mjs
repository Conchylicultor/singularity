// End-to-end regression for the caret-trigger menus (`/`, `[[`, `@`, `$$`).
//
// The bug this exists to catch: each menu used to hold a `dismissedRef` boolean
// latch that was cleared across several early-return branches of its update
// listener. An EMPTY Lexical block has no TextNode (the selection anchor is the
// ParagraphNode), so the branch that cleared the latch was unreachable exactly
// when the block was empty — after Esc, retyping the trigger silently did
// nothing, permanently, for that block.
//
// Neither tsc nor a unit test sees this: the failing path is stateful and lives
// in the DOM. So we drive the real app.
//
// The script creates its OWN scratch page and deletes it on the way out — it
// must never type into a page a human owns.
//
// Usage:
//   bun e2e/caret-trigger-wedge.mjs --origin http://<worktree>.localhost:9000
//
// Exits non-zero on the first failed assertion, after dumping a screenshot.

import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const ORIGIN = arg("origin");
const OUT = arg("out", "/tmp/caret-trigger");
if (!ORIGIN) {
  console.error("--origin is required (e.g. http://my-worktree.localhost:9000)");
  process.exit(1);
}

// Every trigger menu's surface carries `data-caret-trigger="<id>"`, so both
// "is this specific menu open" and the arbiter's at-most-one-owner invariant
// are observable without depending on each menu's body copy.
const MENU = "[data-caret-trigger]";
const menuFor = (id) => `[data-caret-trigger="${id}"]`;

// `type` is what we type; `len` is how many Backspaces undo it.
//
// Two triggers need more than the bare token:
//   `@`  — `buildMenu(q).open` gates the menu on chrono actually parsing a date,
//          so a bare `@` never opens.
//   `$$` — a `$$` at offset 0 of a block's first text node is the BLOCK-equation
//          markdown shortcut; inline math deliberately defers to it (`canOpen`).
//          So it must be typed mid-line.
const TRIGGERS = [
  { id: "slash", type: "/", len: 1 },
  { id: "page-link", type: "[[", len: 2 },
  { id: "date", type: "@nov 3", len: 6 },
  { id: "math", type: "x $$y", len: 5 },
];

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) failures++;
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => console.error("  [pageerror]", e.message));
// `networkidle` never settles — the app holds a live notifications WebSocket.
// Timeouts are generous because this repo's builds routinely drive host load
// well past core count, and a starved headless Chromium needs tens of seconds
// to boot the SPA.
page.setDefaultTimeout(90_000);
page.setDefaultNavigationTimeout(90_000);

// --- scratch page: create, use, destroy -------------------------------------
// Boot the Pages app once, then reach the scratch page by clicking it in the
// sidebar. A cold `goto` straight to /pages/page/<id> also works, but it pays a
// full SPA boot — which can run to tens of seconds when the host is busy — for
// every navigation. One boot, then client-side nav, keeps the run predictable.
const SCRATCH_TITLE = "zz caret-trigger e2e";

await page.goto(`${ORIGIN}/pages`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Pages");

const pageId = await page.evaluate(async (title) => {
  const create = async (body) => {
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  };
  // A page block's data is `{ title, icon }` — NOT `{ text }`. A malformed page
  // row blanks the entire Pages app, sidebar included.
  const id = await create({ parentId: null, type: "page", data: { title, icon: null } });
  // A page with no children renders no block editor — seed the one text block
  // every case types into. Deleting the page cascades it away.
  await create({ parentId: id, type: "text", data: { text: [] } });
  return id;
}, SCRATCH_TITLE);
console.log(`scratch page: ${pageId}`);

async function destroyScratchPage() {
  const status = await page.evaluate(async (id) => {
    const res = await fetch(`/api/blocks/${id}`, { method: "DELETE" });
    return res.status;
  }, pageId);
  console.log(`\nscratch page deleted (HTTP ${status})`);
}

try {
  // The title can match more than one sidebar row (tree + favorites); the page
  // tree entry is the last. Clicking the wrong one silently doesn't navigate.
  await page.locator(`text=${SCRATCH_TITLE}`).last().click();
  await page.waitForURL(`**/pages/page/${pageId}`);
  await page.waitForSelector('[contenteditable="true"]');

  /** Focus the page's block and empty it — the state that used to wedge. */
  async function freshBlock() {
    let block = page.locator('[contenteditable="true"]').last();
    await block.click();
    await page.keyboard.press("End");
    // Clear whatever is there. `Ctrl+A` is scoped by ContentScope and can select
    // the block set rather than the text, so walk it back a character at a time.
    // Backspace past the start of the block can delete + remount it, which drops
    // editor focus — and `open` is focus-gated, so we must re-focus afterwards or
    // every subsequent assertion fails for the wrong reason.
    const text = await block.innerText();
    for (let i = 0; i < text.length; i++) await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);

    block = page.locator('[contenteditable="true"]').last();
    await block.click();
    await page.keyboard.press("End");
    await page.waitForTimeout(200);

    const left = (await block.innerText()).trim();
    if (left !== "") throw new Error(`block not empty after clear: ${JSON.stringify(left)}`);
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("contenteditable") === "true",
    );
    if (!focused) throw new Error("editor lost focus after clearing the block");
    return block;
  }

  const visible = async (sel) => (await page.locator(sel).count()) > 0;

  for (const { id, type, len } of TRIGGERS) {
    console.log(`\n=== ${id}  (types ${JSON.stringify(type)})`);
    await freshBlock();

    // 1. trigger opens the menu
    await page.keyboard.type(type, { delay: 40 });
    await page.waitForTimeout(500);
    check(await visible(menuFor(id)), "opens on first trigger");

    // 2. Esc dismisses
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    check(!(await visible(menuFor(id))), "Esc dismisses");

    // 3. backspace back to an empty block (the old latch-clearing branch was
    //    unreachable here — the anchor is a ParagraphNode, not a TextNode)
    for (let i = 0; i < len; i++) await page.keyboard.press("Backspace");
    await page.waitForTimeout(250);

    // 4. THE BUG: retyping the trigger must reopen the menu
    await page.keyboard.type(type, { delay: 40 });
    await page.waitForTimeout(500);
    if (!check(await visible(menuFor(id)), "REOPENS after Esc → empty → retype")) {
      await page.screenshot({ path: `${OUT}-${id}-wedged.png` });
    }

    // 5. blur closes; refocus re-derives open (blur must never latch).
    //    Blur the editor directly — clicking the page chrome would risk
    //    navigating away rather than just moving focus.
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    check(!(await visible(menuFor(id))), "blur closes");

    await page.locator('[contenteditable="true"]').last().click();
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    check(await visible(menuFor(id)), "refocus reopens (blur did not latch)");
  }

  // 6. Arbiter: `chrono` parses "friday" out of the `@` query, so `@` stays valid
  //    while `[[` also matches. Exactly one menu may be open, and it must be the
  //    one closest to the caret (`[[`, the rightmost trigger).
  console.log("\n=== arbiter  (@friday [[bar)");
  await freshBlock();
  await page.keyboard.type("@friday [[bar", { delay: 40 });
  await page.waitForTimeout(600);
  const openMenus = await page
    .locator(MENU)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-caret-trigger")));
  check(openMenus.length === 1, `exactly one menu open (saw ${JSON.stringify(openMenus)})`);
  check(openMenus[0] === "page-link", "the rightmost trigger ([[) owns the caret");

  // 7. `$$` passes navigate:false, so arrows must still move the caret through
  //    the LaTeX rather than being swallowed by the menu.
  console.log("\n=== math arrows");
  await freshBlock();
  await page.keyboard.type("x $$a+b", { delay: 40 });
  await page.waitForTimeout(400);
  check(await visible(menuFor("math")), "math menu open");
  const before = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1);
  check(after === before - 1, `ArrowLeft moves the caret (${before} → ${after})`);

  await page.screenshot({ path: `${OUT}-final.png` });
} finally {
  await destroyScratchPage();
  await browser.close();
}

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} assertion(s))`}`);
process.exit(failures === 0 ? 0 : 1);
