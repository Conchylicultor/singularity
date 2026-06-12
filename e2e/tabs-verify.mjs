import { chromium } from "playwright";

const BASE = "http://att-1781283277-ilxk.localhost:9000";
const OUT = "/tmp/tabs";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  colorScheme: "dark",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const tabs = () => page.locator("button[data-app-tab]");
async function dump(tag) {
  const labels = await tabs().evaluateAll((els) =>
    els.map((e) => ({ app: e.getAttribute("data-app-tab"), active: e.getAttribute("aria-pressed") })),
  );
  console.log(`[${tag}] url=${page.url()} tabs=${labels.length} ${JSON.stringify(labels)}`);
  return labels;
}

await page.goto(BASE);
await page.waitForTimeout(3000);
await dump("1-initial");                 // expect 1 tab (home) from URL
await page.screenshot({ path: `${OUT}-1-initial.png` });

// 2) Click + → new Home tab appears and focuses.
await page.getByRole("button", { name: "New tab" }).click();
await page.waitForTimeout(900);
await dump("2-after-+");                  // expect 2 home tabs, 2nd active

// 3) Open Studio from the Home launcher (tab-aware) → a Studio tab.
await page.getByRole("button", { name: "Studio" }).first().click();
await page.waitForTimeout(1200);
await dump("3-open-studio");              // expect home,home,studio (studio active)
await page.screenshot({ path: `${OUT}-3-studio.png` });

// Deepen the Studio tab's route within the app: open the Explorer pane.
await page.getByText("Explorer", { exact: true }).first().click();
await page.waitForTimeout(1000);
const tabAUrl = page.url();              // .../studio/explorer
console.log("TAB A (studio) deep URL:", tabAUrl);
await page.screenshot({ path: `${OUT}-4-studio-deep.png` });

// 4) Switch to the first Home tab, then back to Studio.
await tabs().nth(0).click();
await page.waitForTimeout(900);
await dump("4a-on-home");
console.log("URL while on Home tab:", page.url());
await page.screenshot({ path: `${OUT}-5-home-tab.png` });

await tabs().nth(2).click();             // back to Studio tab
await page.waitForTimeout(900);
const backUrl = page.url();
await dump("4b-back-to-studio");
console.log("URL back on Studio tab:", backUrl);
console.log("KEEP-ALIVE: studio deep route preserved:", backUrl === tabAUrl);
await page.screenshot({ path: `${OUT}-6-back-to-studio.png` });

// 5) Reload — tabs + routes restore from sessionStorage.
const before = await tabs().evaluateAll((els) => els.map((e) => e.getAttribute("data-app-tab")));
await page.reload();
await page.waitForTimeout(3000);
const after = await dump("5-after-reload");
const afterApps = after.map((t) => t.app);
console.log("PERSIST: apps before:", JSON.stringify(before), "after:", JSON.stringify(afterApps));
console.log("PERSIST: focused URL after reload:", page.url(), "== tabA:", page.url() === tabAUrl);
await page.screenshot({ path: `${OUT}-7-reload.png` });

// 6) Back/forward affects only the focused tab + URL reflects focused tab.
const urlBeforeBack = page.url();
await page.goBack();
await page.waitForTimeout(800);
const urlAfterBack = page.url();
const labelsDuringBack = await tabs().evaluateAll((e) => e.length);
await page.goForward();
await page.waitForTimeout(800);
const urlAfterForward = page.url();
console.log("BACK/FWD:", { urlBeforeBack, urlAfterBack, urlAfterForward, tabsStillPresent: labelsDuringBack });

console.log("CONSOLE ERRORS:", errors.length ? errors : "none");
await browser.close();
