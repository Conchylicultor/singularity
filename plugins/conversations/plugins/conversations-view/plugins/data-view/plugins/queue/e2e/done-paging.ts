/**
 * Verifies the queue's Done section pages as the user scrolls: its header
 * reads the EXACT number of ended conversations from the first paint (the
 * collection's `:count`, not "30+"), and stays put while pages load; more rows
 * page in once the tail scrolls into view, and none while the Done section is
 * collapsed (the sentinel is then right under the header, so an ungated
 * observer would page the whole history in).
 *
 *   ./singularity run plugins/conversations/plugins/conversations-view/plugins/data-view/plugins/queue/e2e/done-paging.ts --headed
 */
import type { Page } from "playwright";
import {
  arg,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = arg("out") ?? "/tmp/queue-done-paging";

/** The Done header's count. */
async function doneCount(page: Page): Promise<number> {
  const m = /(\d+)/.exec(await doneHeader(page));
  return m ? Number(m[1]) : -1;
}

/** The Done header's text (label + count). */
async function doneHeader(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll("button"))
        .find((b) =>
          /^Done\s+\d+\+?$/.test(b.innerText.trim().replace(/\s+/g, " ")),
        )
        ?.innerText.replace(/\s+/g, " ")
        .trim() ?? "",
  );
}

/** Click the Done header (collapse / expand the section). */
async function toggleDone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll("button")).find((b) =>
      /^Done\s+\d+\+?$/.test(b.innerText.trim().replace(/\s+/g, " ")),
    );
    if (!header) throw new Error("no Done header");
    header.click();
  });
}

/** The last rendered conversation row's text — moves when a page lands past it. */
async function tailMarker(page: Page): Promise<string> {
  return (
    (await page
      .locator('[data-ui-owner^="ConversationItem"]')
      .last()
      .innerText()) ?? ""
  );
}

/** Scroll the last conversation into view, then let a page land. */
async function scrollToTail(page: Page): Promise<void> {
  await page
    .locator('[data-ui-owner^="ConversationItem"]')
    .last()
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
}

await withBrowser(async (h) => {
  const r = report("conversations queue — Done pages as you scroll");
  const { page, captured } = await h.session();

  await page.goto(pathUrl("agents"), { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-ui-owner^="ConversationItem"]')
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);

  const total = await doneCount(page);
  const initialTail = await tailMarker(page);
  r.note(`Done header: "${await doneHeader(page)}"`);
  r.ok(
    "the Done count is the exact total, not a lower bound",
    total > 30 && !(await doneHeader(page)).endsWith("+"),
    `got "${await doneHeader(page)}" (needs > 30 ended conversations)`,
  );

  await scrollToTail(page);
  await scrollToTail(page);
  const grownTail = await tailMarker(page);
  r.note(`after scrolling — header "${await doneHeader(page)}"`);
  r.ok(
    "scrolling to the tail pages more Done rows in",
    grownTail !== initialTail,
    `tail still "${grownTail}"`,
  );
  r.ok(
    "the exact count does not move as pages load",
    (await doneCount(page)) === total,
    `before ${total}, after ${await doneCount(page)}`,
  );
  await snap(page, OUT, "grown");

  // Collapse Done: the sentinel sits right under its header, in view.
  await toggleDone(page);
  await page.waitForTimeout(3000);
  const collapsedHeader = await doneHeader(page);
  await snap(page, OUT, "collapsed");
  r.note(`collapsed header: "${collapsedHeader}"`);
  // Expand again: nothing loaded while it was collapsed.
  await toggleDone(page);
  await page.waitForTimeout(500);
  const afterCollapse = await tailMarker(page);
  r.ok(
    "nothing pages in while Done is collapsed",
    afterCollapse === grownTail,
    `before "${grownTail}", after "${afterCollapse}"`,
  );

  const errors = [...captured.pageErrors, ...captured.consoleErrors];
  r.ok("no page or console errors", errors.length === 0, errors.join("\n"));
  await r.finish();
});
