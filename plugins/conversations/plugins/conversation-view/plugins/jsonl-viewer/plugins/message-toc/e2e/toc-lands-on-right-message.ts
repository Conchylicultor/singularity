/**
 * Verifies each table-of-contents entry navigates to the message it names.
 *
 * This regressed silently for a long time: entries carried the index into the
 * *unfiltered* event array while the DOM stamps its positional attribute over the
 * *filtered* one, so any conversation where an `EventFilter` hid an earlier row
 * (`ask-user-question` hides `user-text` — exactly the kind listed here) sent
 * every entry to the wrong message. Counting entries, or asserting that *a* row
 * was reached, both pass with that bug live; the assertion has to compare the
 * entry's own preview text against the row it actually landed on.
 *
 *   bun plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/message-toc/e2e/toc-lands-on-right-message.ts --conv <id>
 */
import {
  arg,
  boot,
  pathUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";

const TOC_PANEL = ".group\\/fa";
// Scoped to the panel: `span.tabular-nums` also matches the timestamp chip on
// every transcript row, so an unscoped query indexes a different button set than
// the one whose labels were read — and then clicks arbitrary rows.
const TOC_ENTRY = `${TOC_PANEL} button:has(> span.tabular-nums)`;
const SETTLE_MS = 2500;

const convId = arg("conv") ?? "conv-1785419906-z31p";

/**
 * How far a specific row sits from the top of the transcript viewport, in px.
 * `null` when no row carries that key.
 *
 * Asks about the *target* row rather than "which row is topmost". User messages
 * are wrapped in sticky section headers, so the previous section's header is
 * pinned at the top edge and a topmost-row query keeps naming the row before the
 * one that was actually revealed. Identity, not text, because every row's
 * `textContent` opens with its timestamp chip and the drag-and-drop
 * accessibility instructions from the reorderable action strip.
 */
async function userRowOffsets(page: Page): Promise<{ key: string; offset: number }[]> {
  return page.evaluate(() => {
    const scroller = [...document.querySelectorAll("[data-pane-scroll]")].find(
      (n) => n.querySelector("[data-event-key]"),
    ) as HTMLElement | undefined;
    if (!scroller) throw new Error("no transcript scroller");
    const viewTop = scroller.getBoundingClientRect().top;
    return [...scroller.querySelectorAll('[data-event-key^="user-text:"]')].map(
      (row) => ({
        key: row.getAttribute("data-event-key") ?? "",
        offset: row.getBoundingClientRect().top - viewTop,
      }),
    );
  });
}

/**
 * Where the target row ended up, as a fraction of the viewport height.
 * `null` when no row carries that key.
 *
 * Deliberately NOT "which user row is topmost": user messages are wrapped in
 * sticky section headers, so the current section's header is pinned at offset ≈ 0
 * forever and would answer that question no matter where the transcript is. The
 * target's own position cannot be spoofed that way. A fraction rather than px
 * because the last entry can't always reach the very top — there may not be
 * enough content below it to scroll against.
 */
async function targetPosition(page: Page, key: string): Promise<number | null> {
  return page.evaluate((k) => {
    const scroller = [...document.querySelectorAll("[data-pane-scroll]")].find(
      (n) => n.querySelector("[data-event-key]"),
    ) as HTMLElement | undefined;
    if (!scroller) throw new Error("no transcript scroller");
    const row = scroller.querySelector(`[data-event-key="${CSS.escape(k)}"]`);
    if (!row) return null;
    const offset =
      row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    return offset / scroller.clientHeight;
  }, key);
}

async function findEntryButton(page: Page, label: string) {
  for (const handle of await page.$$(TOC_ENTRY)) {
    const own = await handle.evaluate(
      (n) => n.querySelector("span")?.textContent?.trim() ?? "",
    );
    if (own === label) return handle;
  }
  return null;
}

/**
 * Wait until the smooth scroll stops moving.
 *
 * The lead-in matters: a smooth scroll does not begin in the same tick as the
 * click, so sampling immediately gives two identical readings and "it has
 * settled" is indistinguishable from "it has not started". That reads as a
 * failure on precisely the longest jump — the one most worth testing.
 */
async function settleScroll(page: Page): Promise<void> {
  await page.waitForTimeout(400);
  let previous = Number.NaN;
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    const rows = await userRowOffsets(page);
    const current = rows[0]?.offset ?? 0;
    if (current === previous) {
      if (++stable >= 2) return;
    } else {
      stable = 0;
    }
    previous = current;
    await page.waitForTimeout(150);
  }
}

/** Every user message currently rendered, in DOM order. */
async function userRowKeys(page: Page): Promise<string[]> {
  return page.$$eval('[data-event-key^="user-text:"]', (nodes) =>
    nodes.map((n) => n.getAttribute("data-event-key") ?? ""),
  );
}

await withBrowser(async (h) => {
  const r = report("message-toc lands on the right message");
  const { page } = await h.session();

  await boot(page, pathUrl(`/agents/c/${convId}`), {
    marker: "[data-event-key]",
    settleMs: SETTLE_MS,
  });

  // The TOC is a hover-revealed floating panel; its entries are in the DOM.
  const entries = await page.$$eval(
    TOC_ENTRY,
    (nodes) =>
      nodes
        .map((n) => {
          const spans = n.querySelectorAll("span");
          return {
            label: spans[0]?.textContent?.trim() ?? "",
            preview: spans[1]?.textContent?.trim() ?? "",
          };
        })
        .filter((e) => /^#\d+$/.test(e.label)),
  );

  r.ok(
    "the TOC lists at least two user messages",
    entries.length >= 2,
    `found ${entries.length} TOC entries — pick a conversation with more via --conv`,
  );
  r.note(`${entries.length} TOC entries`);

  // The independent oracle: entry #N must land on the Nth rendered user message.
  // Under the old positional scheme the TOC counted over the UNFILTERED array
  // while the DOM was stamped from the filtered one, so this correspondence
  // broke wherever an EventFilter had hidden an earlier row.
  const userRows = await userRowKeys(page);
  r.note(`${userRows.length} user-text rows rendered`);
  r.ok(
    "every listed message is actually rendered",
    userRows.length === entries.length,
    `TOC lists ${entries.length} messages but ${userRows.length} user rows are rendered ` +
      `— the list and the transcript disagree about which events exist`,
  );

  // Check a spread of entries, not just the first: the off-by-filter bug grows
  // with distance from the top, so entry #1 can land correctly while later ones
  // do not.
  const probes = [...new Set([0, Math.floor(entries.length / 2), entries.length - 1])];

  for (const i of probes) {
    const entry = entries[i]!;
    // The panel is hover-revealed; collapsed, it intercepts pointer events on
    // its own entries. Re-open before each click — the previous click moved the
    // pointer away.
    await page.hover(TOC_PANEL);
    // The panel expands via a width/height transition; clicking mid-animation is
    // silently swallowed, which reads as "the entry navigated nowhere".
    await page.waitForSelector(TOC_ENTRY, { state: "visible" });
    await page.waitForTimeout(500);
    // Pick the button by its own "#N" label, never by index: the page hosts more
    // than one FloatingAction, so the raw handle list is not the same set the
    // labelled entries were read from and the indices do not correspond.
    const button = await findEntryButton(page, entry.label);
    if (!button) {
      r.ok(`entry ${entry.label} is clickable`, false, "no button carries that label");
      continue;
    }
    await button.click();
    await settleScroll(page);

    const expected = userRows[i]!;
    const at = await targetPosition(page, expected);
    // Revealed = in the upper half of the viewport. Exactly 0 is unattainable
    // for the final entry, and precision is not what is under test — landing on
    // the right message is.
    const ok = at !== null && at >= -0.05 && at <= 0.5;
    r.ok(
      `entry ${entry.label} ("${entry.preview.slice(0, 32)}") reveals its own message`,
      ok,
      at === null
        ? `no row carries ${expected} — the entry points at nothing`
        : `${expected} ended up at ${(at * 100).toFixed(0)}% of the viewport height ` +
          `(0% = top); the click revealed a different message`,
    );
  }

  return r.finish();
});
