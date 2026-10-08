/**
 * Verifies the queue's Done section pages as the user scrolls: it starts at
 * the default window (30), grows past it once the tail scrolls into view, and
 * stops growing while the Done section is collapsed (the sentinel is then
 * right under the header, so an ungated observer would page the whole
 * history in).
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

/** The Done header's count: rows loaded, `+` while more exist. */
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

  const initial = await doneCount(page);
  r.note(`Done header: "${await doneHeader(page)}"`);
  r.ok(
    "the Done section starts at the default window",
    initial === 30,
    `got ${initial}`,
  );
  r.ok(
    "its count reads as a lower bound while more exist",
    (await doneHeader(page)).endsWith("+"),
  );

  await scrollToTail(page);
  await scrollToTail(page);
  const grown = await doneCount(page);
  r.note(
    `after scrolling: ${grown} Done rows — header "${await doneHeader(page)}"`,
  );
  r.ok(
    "scrolling to the tail pages more Done rows in",
    grown > initial,
    `got ${grown}`,
  );
  await snap(page, OUT, "grown");

  // Collapse Done: the sentinel sits right under its header, in view.
  await toggleDone(page);
  await page.waitForTimeout(3000);
  const collapsedHeader = await doneHeader(page);
  await snap(page, OUT, "collapsed");
  r.note(`collapsed header: "${collapsedHeader}"`);
  // Expand again and count: nothing loaded while it was collapsed.
  await toggleDone(page);
  await page.waitForTimeout(500);
  const afterCollapse = await doneCount(page);
  r.ok(
    "nothing pages in while Done is collapsed",
    afterCollapse === grown,
    `before ${grown}, after ${afterCollapse}`,
  );

  const errors = [...captured.pageErrors, ...captured.consoleErrors];
  r.ok("no page or console errors", errors.length === 0, errors.join("\n"));
  await r.finish();
});
