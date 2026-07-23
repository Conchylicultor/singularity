// Probe (not a pass/fail gate): what happens to keystrokes typed in the
// sub-render window immediately after Enter-split, at inhuman speed (delay 5ms,
// no pause after Enter)? Historically compared the CRDT path against the
// (since-deleted) legacy pipeline; now probes the unconditional CRDT path.
//
// Prints observations and exits 0 regardless — nothing here is an assertion.
//
// Usage: bun plugins/page/plugins/editor-collab/e2e/split-typing-window-probe.ts [--base <url>] [--pause <ms-after-enter>]
import {
  baseUrl,
  numArg,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const pause = numArg("pause", 0);

await withBrowser(async (h) => {
  const { page } = await h.session();

  await openBlankPage(page, base, { settleMs: 3000 });

  const LINES = ["alpha one", "bravo two", "charlie three", "delta four"] as const;
  await page.keyboard.type(LINES[0], { delay: 5 });
  for (const line of LINES.slice(1)) {
    await page.keyboard.press("Enter");
    if (pause > 0) await page.waitForTimeout(pause);
    await page.keyboard.type(line, { delay: 5 });
  }
  await page.waitForTimeout(3000);

  const texts = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-block-id] [contenteditable="true"]',
      ),
    ].map((el) => el.innerText),
  );
  console.log("pause:", pause, "observed:", JSON.stringify(texts));
  console.log("expected:", JSON.stringify(LINES));
});
