import { chromium } from "playwright";

const URL = "http://claude-1776940724-olee.localhost:9000/events-test";
const OUT = "/tmp/events-test-flow";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

page.on("console", (m) => {
  if (m.type() === "error") console.log(`[browser.error] ${m.text()}`);
});

// Clear any prior state
await page.request.post("http://claude-1776940724-olee.localhost:9000/api/events-test/reset");
const existing = await page.request.get("http://claude-1776940724-olee.localhost:9000/api/events-test/triggers").then((r) => r.json());
for (const row of existing.rows) {
  await page.request.delete(`http://claude-1776940724-olee.localhost:9000/api/events-test/trigger/${row.id}`);
}

await page.goto(URL);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}-01-initial.png` });
console.log("01-initial: captured");

// Fill Subscribe form — filtered subscription for userId=alice with oneShot
const subSection = page.locator("section").filter({ hasText: "Subscribe" }).first();
await subSection.getByPlaceholder("empty = match any").fill("alice");
await subSection.getByPlaceholder("required").fill("alice-oneshot");
await subSection.getByRole("button", { name: /Subscribe/i }).click();
await page.waitForTimeout(600);

// Add a second, match-any recurring subscription
await subSection.getByPlaceholder("empty = match any").fill("");
await subSection.getByPlaceholder("required").fill("any-recurring");
await subSection.getByText("oneShot (delete row after fire)").click();
await subSection.getByRole("button", { name: /Subscribe/i }).click();
await page.waitForTimeout(600);

await page.screenshot({ path: `${OUT}-02-two-subscribed.png` });
console.log("02-two-subscribed: captured");

// Emit for userId=alice → both triggers should fire; alice-oneshot deletes
const emitSection = page.locator("section").filter({ hasText: "Emit" }).first();
await emitSection.getByPlaceholder("required").fill("alice");
await emitSection.getByPlaceholder(/defaults to/).fill("first ping");
await emitSection.getByRole("button", { name: /Emit pinged/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-03-after-emit-alice.png` });
console.log("03-after-emit-alice: captured");

// Emit for userId=bob → only the recurring match-any should fire
await emitSection.getByPlaceholder("required").fill("bob");
await emitSection.getByPlaceholder(/defaults to/).fill("second ping");
await emitSection.getByRole("button", { name: /Emit pinged/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-04-after-emit-bob.png` });
console.log("04-after-emit-bob: captured");

// Sweep all triggers with label=any-recurring via the Delete-by-config form
const sweepSection = page.locator("section").filter({ hasText: "Delete triggers by action config" }).first();
await sweepSection.getByPlaceholder(/JSONB/).fill("any-recurring");
await sweepSection.getByRole("button", { name: /Sweep/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-05-after-sweep.png` });
console.log("05-after-sweep: captured");

// Assert final state via API
const triggers = await page.request.get("http://claude-1776940724-olee.localhost:9000/api/events-test/triggers").then((r) => r.json());
const log = await page.request.get("http://claude-1776940724-olee.localhost:9000/api/events-test/log").then((r) => r.json());
console.log(`final triggers: ${triggers.rows.length} (expect 0)`);
console.log(`final log entries: ${log.entries.length} (expect 3: alice/alice-oneshot, alice/any-recurring, bob/any-recurring)`);
for (const e of log.entries) console.log(` - ${e.label} userId=${e.payload.userId} msg=${JSON.stringify(e.payload.message)}`);

await browser.close();
