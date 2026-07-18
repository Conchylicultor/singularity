// Verifies shell-level history snapshots: browser Back/Forward across apps and
// tabs (research/2026-07-18-global-shell-history-snapshots.md).
//
// Usage:
//   bun e2e/history-nav.mjs --base http://<worktree>.localhost:9000 [--out /tmp/histnav]
//
// Scenarios (PASS/FAIL logged per assertion, exit 1 on any failure):
//   A. /story → rail-click Settings → Back returns to /story; Forward → Settings.
//   B. /agents deep link → Settings → Back restores the exact deep link, with
//      history.state carrying {tabId, appId}; reload mints no phantom tab.
//   C. New tab (+) → Back refocuses the previous tab.
//   D. Reload mid-history: /story → Settings → reload → Back still → /story.

import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const base = arg("base");
const out = arg("out", "/tmp/histnav");
if (!base) {
  console.error("Usage: bun e2e/history-nav.mjs --base http://<worktree>.localhost:9000 [--out <prefix>]");
  process.exit(2);
}

let failures = 0;
function check(name, cond, detail = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`${status}  ${name}${detail ? `  (${detail})` : ""}`);
}

const pathname = (page) => new URL(page.url()).pathname;

/** Wait until the SPA has painted something meaningful (rail buttons exist). */
async function settle(page, ms = 800) {
  await page.locator("button.size-8").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(ms);
}

/** Click a rail app icon by its accessible name (aria-label = app tooltip). */
async function clickRailApp(page, appName) {
  const btn = page.getByRole("button", { name: appName, exact: true }).first();
  try {
    await btn.waitFor({ timeout: 5000 });
  } catch {
    return false;
  }
  await btn.click();
  await page.waitForTimeout(600);
  return true;
}

/** The persisted in-app tab set for this browser tab (sessionStorage). */
async function persistedTabs(page) {
  return page.evaluate(() => {
    try {
      const key = Object.keys(sessionStorage).find((k) => k.startsWith("app-tabs:"));
      return key ? JSON.parse(sessionStorage.getItem(key)) : null;
    } catch {
      return null; // non-app document (e.g. about:blank after a bad Back)
    }
  });
}

const historyState = (page) => page.evaluate(() => window.history.state);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// ---- Scenario A: cross-app rail click pushes; Back/Forward traverse it ----
{
  const page = await context.newPage();
  await page.goto(`${base}/story`);
  await settle(page);
  check("A: settled on /story", pathname(page) === "/story", pathname(page));

  const clicked = await clickRailApp(page, "Settings");
  check("A: rail-clicked Settings", clicked && pathname(page).startsWith("/settings"), pathname(page));
  const state = await historyState(page);
  check("A: entry carries appId", state?.appId === "settings", JSON.stringify(state)?.slice(0, 120));

  await page.goBack();
  await page.waitForTimeout(800);
  check("A: Back returns to /story", pathname(page) === "/story", pathname(page));
  await page.screenshot({ path: `${out}-A-back.png` });

  await page.goForward();
  await page.waitForTimeout(800);
  check("A: Forward returns to Settings", pathname(page).startsWith("/settings"), pathname(page));
  await page.close();
}

// ---- Scenario B: deep link → Settings → Back restores the EXACT deep link ----
{
  const deep = "/agents/c/conv-1784325578-uxps";
  const page = await context.newPage();
  await page.goto(`${base}${deep}`);
  await settle(page);
  check("B: settled on deep link", pathname(page) === deep, pathname(page));

  const clicked = await clickRailApp(page, "Settings");
  check("B: rail-clicked Settings", clicked && pathname(page).startsWith("/settings"), pathname(page));

  await page.goBack();
  await page.waitForTimeout(800);
  check("B: Back restores exact deep link", pathname(page) === deep, pathname(page));
  const state = await historyState(page);
  check("B: restored entry carries tabId+appId", !!state?.tabId && !!state?.appId, JSON.stringify(state)?.slice(0, 120));
  // Content/theme coherence: the Settings sidebar must be gone after Back.
  const settingsLeftovers = await page.getByText("Appearance", { exact: true }).count();
  check("B: no Settings content leftover", settingsLeftovers === 0, `${settingsLeftovers} matches`);
  await page.screenshot({ path: `${out}-B-back.png` });

  const before = await persistedTabs(page);
  await page.reload();
  await settle(page);
  const after = await persistedTabs(page);
  check(
    "B: reload mints no phantom tab",
    before !== null && after !== null && after.tabs.length === before.tabs.length,
    `before=${before?.tabs.length} after=${after?.tabs.length}`,
  );
  check("B: URL survives reload", pathname(page) === deep, pathname(page));
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
  check("C: + opened a second tab", t1?.tabs.length === (t0?.tabs.length ?? 1) + 1, `tabs=${t1?.tabs.length}`);

  await page.goBack();
  await page.waitForTimeout(800);
  const t2 = await persistedTabs(page);
  check("C: Back refocuses previous tab", t2?.focusedTabId === t0?.focusedTabId, `focused=${t2?.focusedTabId?.slice(0, 8)}`);
  check("C: Back restores previous URL", pathname(page) === "/story", pathname(page));
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
  check("D: Back after reload returns to /story", pathname(page) === "/story", pathname(page));
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nAll scenarios passed." : `\n${failures} assertion(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
