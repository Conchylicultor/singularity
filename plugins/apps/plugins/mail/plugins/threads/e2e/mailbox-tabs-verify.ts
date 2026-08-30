/**
 * Verifies the v2 mailbox model end-to-end against the deployed app:
 *
 *  1. bare `/mail` lands on the ONE threads surface (`/mail/threads`) — no
 *     `/mail/v/*` route survives;
 *  2. the eight mailboxes render as a TAB STRIP, and switching tab re-scopes the
 *     query (each tab sends its own `filter` in the request body);
 *  3. each tab returns a genuinely DIFFERENT ROW SET — not merely a different
 *     request body. This is the assertion that catches the fail-soft failure
 *     mode: a typo'd fieldId/operatorId is dropped silently by `compileWhere`,
 *     and the only visible symptom is every tab showing the same rows;
 *  4. the mailbox scope is an ORDINARY, EDITABLE filter rule — not the locked
 *     chip v1 shipped — and removing it PERSISTS across a reload, landing in the
 *     USER-LAYER config file. That round trip is the whole point of making
 *     mailboxes view instances instead of route params, so it is the assertion
 *     that catches a regression back to v1.
 *
 * Step 3 is destructive by nature (it edits the Inbox tab), so the script
 * finishes by deleting the user-layer override it just created and asserting the
 * authored scope comes back — which doubles as proof that the edit really was a
 * config write, not device-local state.
 *
 * Manual only — nothing runs this automatically.
 *   ./singularity run plugins/apps/plugins/mail/plugins/threads/e2e/mailbox-tabs-verify.ts [--headed]
 */
import { existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import type { Page } from "playwright";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { configDir } from "@plugins/config_v2/data-dirs";
import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const MAILBOXES = [
  "Inbox",
  "Starred",
  "Important",
  "Sent",
  "Drafts",
  "All Mail",
  "Spam",
  "Trash",
];

const OUT = arg("out") ?? "/tmp/mailbox-tabs";

/** The tab strip is the surface's proof-of-render — never settle on a timer. */
const TABS_READY = 'button[title="Trash"]';

/**
 * Generous boot budget: this drives a real deploy on a shared dev box where
 * several worktrees may be building at once (measured load average >30), and the
 * SPA's first paint is the first casualty. Playwright's 30s default turns host
 * contention into a spurious failure of whatever the script was actually testing.
 */
const BOOT_TIMEOUT_MS = 120_000;

/**
 * The user-layer override the UI writes when a view's filter is edited.
 *
 * The namespace is derived from the checkout's own directory name (the same
 * derivation the harness's `target.ts` uses for the URL) rather than from
 * `currentWorktreeName()`: this script runs as a plain `bun` process with none
 * of the backend's env, where that helper resolves to the main namespace.
 */
const STORE_PATH = "apps/mail/threads/mail-threads.jsonc";

const USER_OVERRIDE = configDir.file(
  process.env.SINGULARITY_WORKTREE ?? basename(REPO_ROOT),
  STORE_PATH,
);

/**
 * Wait until the SERVER resolves the edit, not merely until the file exists.
 *
 * Two async hops sit between a filter edit and a reload showing it: the client's
 * debounced config write, then the server's config file-watcher noticing the new
 * file and re-reading it. Asserting on a fixed timer — or even on the override
 * file appearing, which only proves hop one — races the second and reports a
 * false "did not persist". The config snapshot endpoint is the real barrier, so
 * poll THAT.
 *
 * The budget is generous on purpose: the second hop is a `@parcel/watcher`
 * event, and on a loaded host it is not prompt. Measured at **103s** on this
 * machine at load average ~35 (several worktrees building at once); it is
 * near-instant on an idle one, and noticing a file APPEAR is consistently slower
 * than noticing one change or vanish. A tight timeout here would make the script
 * flaky for a reason that has nothing to do with what it is testing.
 */
async function awaitServerResolves(
  page: Page,
  predicate: (inboxView: Record<string, unknown>) => boolean,
  timeoutMs = 300_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page.request.get(pathUrl("/api/config-v2/snapshot"));
    if (res.ok()) {
      const body = (await res.json()) as {
        global: Record<
          string,
          { views?: { id: string; view: Record<string, unknown> }[] }
        >;
      };
      const views = body.global[STORE_PATH]?.views ?? [];
      const inbox = views.find((v) => v.id === "inbox");
      if (inbox && predicate(inbox.view)) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

// The Filter pill's accessible name IS its rule count: "Filter" with none,
// "1 rule" / "N rules" otherwise. One attribute read answers "is the scope still
// applied?" without reaching into the popover.
const PILL =
  'button[aria-label="Filter"], button[aria-label$="rule"], button[aria-label$="rules"]';

/**
 * One mailbox tab. `button[title=…]` rather than `getByRole` because the
 * switcher's chips are drag-reorderable: dnd-kit wraps each in its own
 * `role="button"` sortable shell, so a role query resolves two elements per tab.
 */
function tab(page: Page, name: string) {
  return page.locator(`button[title="${name}"]`);
}

async function pillLabel(page: Page): Promise<string> {
  return (await page.locator(PILL).first().getAttribute("aria-label")) ?? "";
}

async function openFilter(page: Page): Promise<void> {
  await page.locator(PILL).first().click();
  await page.waitForTimeout(400);
}

await withBrowser(async (h) => {
  const r = report("mail — mailboxes as DataView tabs");
  const { page } = await h.session();

  // Every query this run makes, request AND response, so both "did the tab
  // re-scope?" and "did it actually return different rows?" are answered by what
  // went over the wire rather than by what the screen looks like.
  const filtersSent: string[] = [];
  const pages: { filter: string; ids: string[] }[] = [];
  await page.route("**/api/mail/threads/query", async (route) => {
    const body = route.request().postDataJSON() as { filter?: unknown };
    const filter = JSON.stringify(body.filter);
    filtersSent.push(filter);
    const response = await route.fetch();
    const json = (await response.json()) as { items?: { id: string }[] };
    pages.push({ filter, ids: (json.items ?? []).map((t) => t.id) });
    await route.fulfill({ response, json });
  });

  /**
   * The rows a given tab's query answered with, found by the tab's own filter.
   *
   * Two traps rule out the obvious approaches. Reading `pages.at(-1)` after a
   * click is wrong because the response may not have landed yet — every count
   * then shifts by one tab. Waiting for a NEW request is also wrong, because the
   * DataView caches per view: revisiting a tab correctly issues nothing at all.
   *
   * So key the captured pages by the authored filter's GROUP ID (`"id":"inbox"`,
   * `"id":"sent"`, …), which is unique per tab and rides in the request body
   * verbatim. Every tab is visited once below, so each has exactly one page to
   * find, whenever it happened to arrive.
   */
  const rowsForView = (viewId: string): string[] | undefined =>
    pages.find((entry) => entry.filter.includes(`"id":"${viewId}"`))?.ids;

  // ---- 0. precondition: start from the AUTHORED state --------------------
  // This script edits config, and the server's config watcher is slow to notice
  // (~100s on a loaded host). Back-to-back runs would otherwise start mid-catch-up
  // from the previous run's cleanup and fail for that reason alone. So clear any
  // leftover override and wait for the server to be serving the authored origin
  // BEFORE asserting anything.
  if (existsSync(USER_OVERRIDE)) rmSync(USER_OVERRIDE);
  r.ok(
    "precondition: the server is serving the authored config",
    await awaitServerResolves(page, (view) => "filter" in view),
    "a previous run's override may still be resolving",
  );

  // ---- 1. one URL -------------------------------------------------------
  await boot(page, pathUrl("/mail"), {
    marker: TABS_READY,
    timeoutMs: BOOT_TIMEOUT_MS,
    settleMs: 1500,
  });
  r.eq(
    "bare /mail lands on /mail/threads",
    new URL(page.url()).pathname,
    "/mail/threads",
  );

  // ---- 2. eight mailbox tabs -------------------------------------------
  for (const name of MAILBOXES) {
    r.ok(`tab "${name}" is present`, (await tab(page, name).count()) > 0);
  }
  await snap(page, OUT, "tabs");

  // ---- 3. switching tab re-scopes ---------------------------------------
  const beforeSwitch = filtersSent.length;
  for (const name of ["Sent", "Spam"]) {
    await tab(page, name).click();
    await page.waitForTimeout(1500);
    r.eq(
      `"${name}" carries exactly one scope rule`,
      await pillLabel(page),
      "1 rule",
    );
  }
  const distinct = new Set(filtersSent.slice(beforeSwitch));
  r.ok(
    "each tab sent a DISTINCT filter body — the tab IS the scope",
    distinct.size >= 2,
    `distinct filters: ${distinct.size} of ${filtersSent.length - beforeSwitch} requests`,
  );

  // ---- 3b. the tabs return DIFFERENT ROWS, not just different requests -----
  // The fail-soft trap: a dropped rule yields the unscoped account-wide set, so
  // every tab would show the SAME first page. Only real rows can rule that out.
  // Visit every tab once so each has issued its query at least once this run.
  const TAB_VIEW_IDS: [string, string][] = [
    ["Inbox", "inbox"],
    ["Sent", "sent"],
    ["Drafts", "drafts"],
    ["All Mail", "all"],
    ["Spam", "spam"],
  ];
  const rowsByTab: Record<string, string[]> = {};
  for (const [name, viewId] of TAB_VIEW_IDS) {
    await tab(page, name).click();
    await page.waitForTimeout(2500);
    const ids = rowsForView(viewId);
    if (ids === undefined) {
      r.fail(`"${name}" never issued a query for view "${viewId}"`);
      rowsByTab[name] = [];
    } else {
      rowsByTab[name] = ids;
      r.note(`${name}: ${ids.length} rows on its own first page`);
    }
  }
  const inboxRows = rowsByTab["Inbox"] ?? [];
  const sentRows = rowsByTab["Sent"] ?? [];
  const draftRows = rowsByTab["Drafts"] ?? [];
  const spamRows = rowsByTab["Spam"] ?? [];
  const allRows = rowsByTab["All Mail"] ?? [];

  r.ok(
    "Inbox returns a full page of rows",
    inboxRows.length > 20,
    `${inboxRows.length} rows`,
  );
  r.ok(
    "Sent returns its own SMALL set, not the inbox page",
    sentRows.length > 0 && sentRows.length < inboxRows.length,
    `sent=${sentRows.length} inbox=${inboxRows.length}`,
  );
  r.ok(
    "Drafts returns its own set, distinct from Sent",
    JSON.stringify(draftRows) !== JSON.stringify(sentRows),
    `drafts=${JSON.stringify(draftRows)} sent=${JSON.stringify(sentRows)}`,
  );
  r.ok(
    "Spam returns ZERO rows — proof the rule applied, since a dropped rule " +
      "would return the whole account",
    spamRows.length === 0,
    `${spamRows.length} rows`,
  );
  r.ok(
    "All Mail is a superset of Inbox and differs from it",
    allRows.length >= inboxRows.length &&
      JSON.stringify(allRows) !== JSON.stringify(sentRows),
  );
  r.ok(
    "no two of Inbox / Sent / Drafts returned an identical page",
    new Set([inboxRows, sentRows, draftRows].map((x) => JSON.stringify(x)))
      .size === 3,
  );

  // ---- 4. the scope is an ordinary, EDITABLE rule ------------------------
  await tab(page, "Inbox").click();
  await page.waitForTimeout(1200);
  r.eq(
    "Inbox's Filter pill counts its scope rule",
    await pillLabel(page),
    "1 rule",
  );

  await openFilter(page);
  r.ok(
    "the scope renders as an editable rule row",
    (await page.getByText("Where", { exact: true }).count()) > 0,
  );
  // v1 rendered the scope as a LOCKED chip with no affordances at all. The
  // presence of the rule row's own field/operator pickers and its Remove button
  // is exactly the difference v2 is about.
  const where = page.getByText("Where", { exact: true });
  const remove = page.locator('button[aria-label="Remove filter"]').first();
  const popover = where.locator("xpath=ancestor::*[self::div][3]");
  r.ok(
    "the rule reads as `Labels contains Inbox` in friendly names, not raw ids",
    (await popover.getByText("Labels", { exact: true }).count()) > 0 &&
      (await popover.getByText("Contains", { exact: true }).count()) > 0 &&
      (await popover.getByText("Inbox", { exact: true }).count()) > 0,
  );
  r.ok(
    "the rule has a Remove control (it is NOT locked)",
    (await remove.count()) > 0,
  );
  await snap(page, OUT, "filter-open");

  // ---- 5. an edit persists across reload, into the user config -----------
  // The trailing actions are hover-revealed (opacity + pointer-events coupled),
  // so hover the row before reaching for Remove.
  await where.hover();
  await page.waitForTimeout(300);
  await remove.click();
  await page.waitForTimeout(1000);
  r.eq("removing the scope empties the pill", await pillLabel(page), "Filter");

  // The write-back is debounced AND the server re-reads on a file-watcher event,
  // so reload only once the SERVER resolves the edit — otherwise this races two
  // async hops and reports a false negative.
  r.ok(
    "the server resolves the edit (config write-back reached the backend)",
    await awaitServerResolves(page, (view) => !("filter" in view)),
  );
  r.ok(
    "the edit landed in the user-layer config file, not device-local state",
    existsSync(USER_OVERRIDE),
    USER_OVERRIDE,
  );

  await boot(page, pathUrl("/mail/threads"), {
    marker: TABS_READY,
    timeoutMs: BOOT_TIMEOUT_MS,
    settleMs: 2500,
  });
  r.eq(
    "…and the removal SURVIVES a reload (config write-back)",
    await pillLabel(page),
    "Filter",
  );
  await snap(page, OUT, "after-reload");

  // ---- 6. restore ------------------------------------------------------
  // Dropping the override falls the surface back to the authored origin — which
  // is both the cleanup AND the proof that the authored scope is what the file
  // was overriding. A DELETE needs the same server barrier as the write did;
  // the watcher is no faster at noticing a file vanish than at noticing it
  // appear (measured ~95s vs ~103s on a loaded host).
  if (existsSync(USER_OVERRIDE)) rmSync(USER_OVERRIDE);
  r.ok(
    "the server falls back to the authored origin",
    await awaitServerResolves(page, (view) => "filter" in view),
  );
  await boot(page, pathUrl("/mail/threads"), {
    marker: TABS_READY,
    timeoutMs: BOOT_TIMEOUT_MS,
    settleMs: 1500,
  });
  r.eq(
    "dropping the override restores the authored scope",
    await pillLabel(page),
    "1 rule",
  );

  await r.finish();
});
