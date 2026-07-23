// Verifies shell-level history snapshots: browser Back/Forward across apps and
// tabs (research/2026-07-18-global-shell-history-snapshots.md).
//
// Usage:
//   bun plugins/apps-core/plugins/tabs/e2e/history-nav.ts [--base http://<worktree>.localhost:9000] [--out /tmp/histnav]
//
// Scenarios (PASS/FAIL logged per assertion, exit 1 on any failure):
//   A. /story → rail-click Settings → Back returns to /story; Forward → Settings.
//   B. /agents deep link → Settings → Back restores the exact deep link, with
//      history.state carrying {tabId, appId}; reload mints no phantom tab.
//   C. New tab (+) → Back refocuses the previous tab.
//   D. Reload mid-history: /story → Settings → reload → Back still → /story.

import type { Page } from "playwright";
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/histnav");

const r = report();

const pathname = (page: Page): string => new URL(page.url()).pathname;

/** Wait until the SPA has painted something meaningful (rail buttons exist). */
async function settle(page: Page, ms = 800): Promise<void> {
  await page.locator("button.size-8").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(ms);
}

/** Click a rail app icon by its accessible name (aria-label = app tooltip). */
async function clickRailApp(page: Page, appName: string): Promise<boolean> {
  const btn = page.getByRole("button", { name: appName, exact: true }).first();
  try {
    await btn.waitFor({ timeout: 5000 });
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- pre-move behavior: "the rail button never appeared" IS the answer here; the caller asserts on the returned false.
  } catch {
    return false;
  }
  await btn.click();
  await page.waitForTimeout(600);
  return true;
}

/** The shape the tabs plugin persists under its `app-tabs:` sessionStorage key. */
interface PersistedTabState {
  tabs: unknown[];
  focusedTabId?: string;
}

/** The shell's own history-entry snapshot. */
interface HistoryEntryState {
  tabId?: string;
  appId?: string;
}

/** The persisted in-app tab set for this browser tab (sessionStorage). */
function persistedTabs(page: Page): Promise<PersistedTabState | null> {
  return page.evaluate(() => {
    try {
      const key = Object.keys(sessionStorage).find((k) => k.startsWith("app-tabs:"));
      const raw = key ? sessionStorage.getItem(key) : null;
      return raw ? (JSON.parse(raw) as PersistedTabState) : null;
      // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- pre-move behavior: a non-app document has no readable tab state, and every assertion below treats null as exactly that.
    } catch {
      return null; // non-app document (e.g. about:blank after a bad Back)
    }
  });
}

const historyState = (page: Page): Promise<HistoryEntryState | null> =>
  page.evaluate(() => window.history.state as HistoryEntryState | null);

await withBrowser(async (h) => {
  // One browsing context for all four scenarios; each scenario runs on its own
  // page (the session's page serves scenario A) and closes it when done.
  const { context, page: pageA } = await h.session();

  // ---- Scenario A: cross-app rail click pushes; Back/Forward traverse it ----
  {
    const page = pageA;
    await page.goto(`${base}/story`);
    await settle(page);
    r.ok("A: settled on /story", pathname(page) === "/story", pathname(page));

    const clicked = await clickRailApp(page, "Settings");
    r.ok(
      "A: rail-clicked Settings",
      clicked && pathname(page).startsWith("/settings"),
      pathname(page),
    );
    const state = await historyState(page);
    r.ok(
      "A: entry carries appId",
      state?.appId === "settings",
      JSON.stringify(state)?.slice(0, 120),
    );

    await page.goBack();
    await page.waitForTimeout(800);
    r.ok("A: Back returns to /story", pathname(page) === "/story", pathname(page));
    await snap(page, out, "A-back");

    await page.goForward();
    await page.waitForTimeout(800);
    r.ok(
      "A: Forward returns to Settings",
      pathname(page).startsWith("/settings"),
      pathname(page),
    );
    await page.close();
  }

  // ---- Scenario B: deep link → Settings → Back restores the EXACT deep link ----
  {
    const deep = "/agents/c/conv-1784325578-uxps";
    const page = await context.newPage();
    await page.goto(`${base}${deep}`);
    await settle(page);
    r.ok("B: settled on deep link", pathname(page) === deep, pathname(page));

    const clicked = await clickRailApp(page, "Settings");
    r.ok(
      "B: rail-clicked Settings",
      clicked && pathname(page).startsWith("/settings"),
      pathname(page),
    );

    await page.goBack();
    await page.waitForTimeout(800);
    r.ok("B: Back restores exact deep link", pathname(page) === deep, pathname(page));
    const state = await historyState(page);
    r.ok(
      "B: restored entry carries tabId+appId",
      !!state?.tabId && !!state?.appId,
      JSON.stringify(state)?.slice(0, 120),
    );
    // Content/theme coherence: the Settings sidebar must be gone after Back.
    const settingsLeftovers = await page.getByText("Appearance", { exact: true }).count();
    r.ok(
      "B: no Settings content leftover",
      settingsLeftovers === 0,
      `${settingsLeftovers} matches`,
    );
    await snap(page, out, "B-back");

    const before = await persistedTabs(page);
    await page.reload();
    await settle(page);
    const after = await persistedTabs(page);
    r.ok(
      "B: reload mints no phantom tab",
      before !== null && after !== null && after.tabs.length === before.tabs.length,
      `before=${before?.tabs.length} after=${after?.tabs.length}`,
    );
    r.ok("B: URL survives reload", pathname(page) === deep, pathname(page));
    await page.close();
  }

  // ---- Scenario C: new tab (+) pushes; Back refocuses the previous tab ----
  {
    const page = await context.newPage();
    await page.goto(`${base}/story`);
    await settle(page);
    const t0 = await persistedTabs(page);

    await page.getByRole("button", { name: /New tab|New window/ }).click();
    await page.waitForTimeout(800);
    const t1 = await persistedTabs(page);
    r.ok(
      "C: + opened a second tab",
      t1?.tabs.length === (t0?.tabs.length ?? 1) + 1,
      `tabs=${t1?.tabs.length}`,
    );

    await page.goBack();
    await page.waitForTimeout(800);
    const t2 = await persistedTabs(page);
    r.ok(
      "C: Back refocuses previous tab",
      t2?.focusedTabId === t0?.focusedTabId,
      `focused=${t2?.focusedTabId?.slice(0, 8)}`,
    );
    r.ok("C: Back restores previous URL", pathname(page) === "/story", pathname(page));
    await page.close();
  }

  // ---- Scenario D: reload mid-history keeps back-target (tabId survival) ----
  {
    const page = await context.newPage();
    await page.goto(`${base}/story`);
    await settle(page);
    await clickRailApp(page, "Settings");
    await page.reload();
    await settle(page);
    await page.goBack();
    await page.waitForTimeout(800);
    r.ok("D: Back after reload returns to /story", pathname(page) === "/story", pathname(page));
    await page.close();
  }

  r.finish();
});
