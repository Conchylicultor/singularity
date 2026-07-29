// End-to-end regression for the URL-paste menu's KEYBOARD model.
//
// The bug this exists to catch: this menu used to import the caret-trigger
// primitive's `caretAnchor` and hand-roll everything else — a `FloatingSurface`
// of `<Row onClick>`s. It rendered in the right place, so it looked adopted, but
// it had no `activeIndex`, no arrow handling and no Enter: the menu was
// mouse-only. Arrows fell through to the editor, and Enter split the block.
//
// Neither tsc nor a unit test sees that — a menu with no key handling is a menu
// with LESS code, not broken code. Only driving the real keyboard shows it, so
// the assertions here are deliberately about keys, not about the menu opening.
//
// The script creates its OWN scratch page and deletes it on the way out — it
// must never type into a page a human owns.
//
// Usage:
//   bun plugins/page/plugins/url-paste/e2e/url-paste-keyboard.ts [--base <url>]
//
// Exits non-zero on the first failed assertion, after dumping a screenshot.
import {
  arg,
  baseUrl,
  boot,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const ORIGIN = baseUrl();
const OUT = arg("out", "/tmp/url-paste-keyboard");

const MENU = '[data-caret-trigger="url-paste"]';
// The menu's three rows, in commit-index order: bookmark, embed, plain link.
// `CaretTriggerMenu` puts `data-caret-trigger` on a `display:contents` wrapper
// whose children ARE the rows. They are `<div>`s, not `<button>`s: `Row` infers
// its element from `href`/`onClick`, and a caret-menu row commits on
// `onPointerDown` (see `useCaretMenu`) — the same shape as the `/` menu's rows.
const ROWS = `${MENU} > *`;
const URL = "https://example.com/some-article";

const r = report();

await withBrowser(async (h) => {
  const { page } = await h.session();
  // `networkidle` never settles — the app holds a live notifications WebSocket.
  // Timeouts are generous because this repo's builds routinely drive host load
  // past core count, and a starved headless Chromium needs tens of seconds to
  // boot the SPA.
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(90_000);

  const SCRATCH_TITLE = "zz url-paste e2e";

  await boot(page, `${ORIGIN}/pages`, { marker: "text=Pages", timeoutMs: 90_000 });

  const pageId = await page.evaluate(async (title: string): Promise<string> => {
    const create = async (body: unknown): Promise<string> => {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
      return ((await res.json()) as { id: string }).id;
    };
    // A page block's data is `{ title, icon }` — NOT `{ text }`. A malformed page
    // row blanks the entire Pages app, sidebar included.
    const id = await create({ parentId: null, type: "page", data: { title, icon: null } });
    // A page with no children renders no block editor — seed the one text block
    // every case pastes into. Deleting the page cascades it away.
    await create({ parentId: id, type: "text", data: { text: [] } });
    return id;
  }, SCRATCH_TITLE);
  console.log(`scratch page: ${pageId}`);

  async function destroyScratchPage(): Promise<void> {
    const status = await page.evaluate(async (id: string): Promise<number> => {
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

    /**
     * Focus the page's block, empty it, and fire a `paste` carrying a bare URL.
     *
     * The paste is SYNTHETIC. Playwright's `Meta+V` reads the system clipboard,
     * which is shared machine state a headless run must not depend on (or
     * clobber); Lexical's `PASTE_COMMAND` is driven by a plain `paste` listener
     * on the editor root, so a dispatched `ClipboardEvent` carrying a
     * `DataTransfer` exercises exactly the same path.
     */
    async function pasteUrl(): Promise<void> {
      let block = page.locator('[contenteditable="true"]').last();
      await block.click();
      await page.keyboard.press("End");
      // Clear whatever is there. `Ctrl+A` is scoped by ContentScope and can
      // select the block set rather than the text, so walk it back a character
      // at a time. Backspace past the start can delete + remount the block,
      // which drops editor focus — and `open` is focus-gated, so we re-focus.
      const text = await block.innerText();
      for (let i = 0; i < text.length; i++) await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      block = page.locator('[contenteditable="true"]').last();
      await block.click();
      await page.keyboard.press("End");
      await page.waitForTimeout(200);

      await block.evaluate((el: Element, url: string) => {
        const dt = new DataTransfer();
        dt.setData("text/plain", url);
        el.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      }, URL);
      await page.waitForTimeout(500);

      // Park the cursor away from the menu. The menu opens directly under the
      // caret — i.e. under the pointer that just clicked the block — and a row
      // sets the active index on `mouseenter` BY DESIGN, so a stationary cursor
      // resting on a row would fight every arrow press. That is a property of
      // the surface, not of the keyboard model under test.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(150);
    }

    /**
     * Index of the highlighted row — `Row selected` paints `bg-accent`.
     *
     * `classList.contains`, never a substring test: an UNSELECTED row carries
     * `hover:bg-accent`, which contains "bg-accent", so `className.includes`
     * matches every row and silently reports row 0 as active forever — the
     * assertions then pass or fail for reasons unrelated to the keyboard.
     */
    const activeRow = async (): Promise<number> =>
      page
        .locator(ROWS)
        .evaluateAll((els) => els.findIndex((e) => e.classList.contains("bg-accent")));

    const blockText = async (): Promise<string> =>
      (await page.locator('[contenteditable="true"]').last().innerText()).trim();

    // --- the menu opens, with row 0 pre-selected --------------------------------
    console.log("\n=== opens with a highlighted row");
    await pasteUrl();
    const opened = (await page.locator(MENU).count()) > 0;
    r.ok("paste opens the menu", opened);
    if (!opened) await snap(page, OUT, "no-menu");
    r.ok("3 rows (bookmark / embed / plain link)", (await page.locator(ROWS).count()) === 3);
    // The hand-rolled menu had NO active row at all — this is the first thing a
    // keyboard model buys, before any key is pressed.
    r.ok("row 0 starts active", (await activeRow()) === 0);

    // --- THE BUG: arrows must move the highlight --------------------------------
    console.log("\n=== arrows move the selection");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const afterDown = await activeRow();
    r.ok(`ArrowDown → row 1 (saw ${afterDown})`, afterDown === 1);
    if (afterDown !== 1) await snap(page, OUT, "arrowdown-dead");

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    r.ok("ArrowDown → row 2", (await activeRow()) === 2);

    // Wrap-around is `useCaretMenu`'s `move()`, not something a hand-rolled menu
    // tends to get right even when it handles arrows at all.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    r.ok("ArrowDown wraps 2 → 0", (await activeRow()) === 0);

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(200);
    r.ok("ArrowUp wraps 0 → 2", (await activeRow()) === 2);

    // --- Esc dismisses (was a duplicate hand-written command) -------------------
    console.log("\n=== Esc dismisses");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    r.ok("Esc closes the menu", (await page.locator(MENU).count()) === 0);

    // --- Enter commits the ACTIVE row -------------------------------------------
    // Row 2 is "Plain link": it inserts the URL as text in the same block, which
    // is the one outcome observable without leaving the page (bookmark/embed
    // convert the block to a different type and fetch).
    console.log("\n=== Enter commits the active row");
    await pasteUrl();
    r.ok("menu reopened after a fresh paste", (await page.locator(MENU).count()) > 0);
    // A reopened menu must start at row 0 again — the previous section left the
    // highlight on row 2, and the forced producer's query is `""` on every open,
    // so nothing in the query-change path would reset it.
    r.ok("reopen starts back at row 0", (await activeRow()) === 0);
    await page.keyboard.press("ArrowUp"); // 0 → wraps to 2 (Plain link)
    await page.waitForTimeout(200);
    const beforeEnter = await activeRow();
    r.ok(`ArrowUp selects 'Plain link' (saw ${beforeEnter})`, beforeEnter === 2);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    r.ok("Enter closes the menu", (await page.locator(MENU).count()) === 0);
    const text = await blockText();
    // The old menu swallowed nothing: Enter reached Lexical and split the block,
    // leaving it empty. So "the URL is in the block" is precisely the assertion
    // that separates a committed menu from a fallen-through keypress.
    r.ok(`Enter inserted the URL (block reads ${JSON.stringify(text)})`, text === URL);
    if (text !== URL) await snap(page, OUT, "enter-did-not-commit");

    await snap(page, OUT, "final");
  } finally {
    await destroyScratchPage();
  }

  r.finish();
});
