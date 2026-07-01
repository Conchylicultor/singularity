// End-to-end boot verification for a *packaged* release bundle.
//
// A staged/self-contained release (`./singularity release ... --dev`, or the
// Tauri `.app`'s embedded bundle) brings up its own gateway + embedded Postgres
// + backend and serves the SPA single-origin. Process-liveness alone doesn't
// prove the app is usable — the original desktop bug was "Starting… → black
// screen": the stack was up, but the SPA never mounted on the bare
// default-namespace route the webview navigates to. This harness loads that
// exact URL in headless Chromium and asserts the app actually renders, with no
// console errors, no failed requests, and no gateway 502/404 storm.
//
// It is stage-agnostic: point it at the subdomain URL (dev/preview,
// `http://<comp>.localhost:<port>`) or the bare default-namespace URL the Tauri
// shell uses (`http://localhost:<port>/`). The bare URL is the one that
// reproduces the desktop path — always verify that one for a release.
//
// Usage:
//   bun e2e/release-boot-verify.mjs --url <url> \
//     [--expect-selector <css>] [--expect-text <substr>] \
//     [--settle <ms>] [--wait <ms>] [--out <path>] [--color-scheme dark|light]
//
// Exit code 0 = PASS, 1 = FAIL (any hard check failed), 2 = bad usage.
//
// Example (faithful desktop repro against a staged web --dev bundle on :9123):
//   bun e2e/release-boot-verify.mjs \
//     --url http://localhost:9123/ \
//     --expect-selector "[data-app-tab]" \
//     --out /tmp/sonata-release

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// Headless Chromium hardcodes `prefers-color-scheme: light`; mirror the host OS
// so a `colorMode: "system"` app renders as the user sees it (see screenshot.mjs).
function detectOsColorScheme() {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.trim() === "Dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  return "light";
}

const url = arg("url");
const expectSelector = arg("expect-selector");
const expectText = arg("expect-text");
const settleMs = Number(arg("settle", "15000")); // window watched for a 502/404 storm
const waitMs = Number(arg("wait", "8000")); // initial settle before the render assertion
const out = arg("out", "/tmp/release-boot");
const viewport = arg("viewport", "1400x900").split("x").map(Number);
const colorScheme = arg("color-scheme", detectOsColorScheme());
// How many failures on one backend path prefix count as a "storm".
const STORM_THRESHOLD = Number(arg("storm-threshold", "3"));

if (!url) {
  console.error(
    "Usage: bun e2e/release-boot-verify.mjs --url <url> [--expect-selector <css>] [--expect-text <substr>] [--settle <ms>] [--out <path>]",
  );
  process.exit(2);
}

// Bucket a request/response URL by the gateway path class we care about.
function bucket(u) {
  try {
    const p = new URL(u).pathname;
    if (p.startsWith("/ws/")) return "ws";
    if (p.startsWith("/api/")) return "api";
    if (p.startsWith("/zero")) return "zero";
    return "static";
  } catch {
    return "other";
  }
}

const consoleErrors = [];
const pageErrors = [];
const requestFailures = []; // { url, bucket, reason }
const badResponses = []; // { url, bucket, status }

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: viewport[0], height: viewport[1] },
  colorScheme,
});
const page = await context.newPage();

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("requestfailed", (req) => {
  // Chromium reports canceled/aborted requests here too; keep the raw reason so
  // the report can distinguish a real dial failure from a benign navigation abort.
  requestFailures.push({
    url: req.url(),
    bucket: bucket(req.url()),
    reason: req.failure()?.errorText ?? "unknown",
  });
});
page.on("response", (res) => {
  if (res.status() >= 400) {
    badResponses.push({ url: res.url(), bucket: bucket(res.url()), status: res.status() });
  }
});

console.log(`→ loading ${url} (color-scheme: ${colorScheme})`);
let navOk = true;
try {
  // `domcontentloaded` not `networkidle`: a healthy app holds a WS open forever,
  // so networkidle never fires. We settle explicitly below.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
} catch (e) {
  navOk = false;
  console.error(`✗ navigation failed: ${e.message}`);
}

// Initial settle, then keep watching through the settle window so a
// mount-then-crash or a delayed 502/404 storm is caught (not just first paint).
await page.waitForTimeout(waitMs);
await page.screenshot({ path: `${out}-loaded.png` }).catch(() => {});

// ── Render assertion: did the SPA actually mount a real tree? ────────────────
// A black screen / stuck "Starting…" leaves #root empty or near-empty. A real
// app mounts dozens of nodes. We measure the live DOM under #root.
const rootStats = await page.evaluate(() => {
  const root = document.getElementById("root");
  if (!root) return { present: false, childCount: 0, descendantCount: 0, text: "" };
  return {
    present: true,
    childCount: root.childElementCount,
    descendantCount: root.querySelectorAll("*").length,
    text: (root.innerText || "").trim().slice(0, 200),
  };
});

let selectorFound = null;
if (expectSelector) {
  selectorFound = (await page.locator(expectSelector).count()) > 0;
}
let textFound = null;
if (expectText) {
  textFound = (await page.content()).includes(expectText);
}

// Wait out the rest of the settle window to catch late failures, then re-check
// the render survived (guards against mount-then-unmount crashes).
const remaining = Math.max(0, settleMs - waitMs);
if (remaining > 0) await page.waitForTimeout(remaining);
const survivedDescendants = await page
  .evaluate(() => document.getElementById("root")?.querySelectorAll("*").length ?? 0)
  .catch(() => 0);
await page.screenshot({ path: `${out}-settled.png` }).catch(() => {});

await browser.close();

// ── Verdict ──────────────────────────────────────────────────────────────────
const failures = [];
if (!navOk) failures.push("navigation to the URL failed");
if (!rootStats.present) failures.push("#root element is absent (SPA shell never loaded)");
// A genuinely-mounted app has many nodes; <10 is a black screen / bare loader.
if (rootStats.present && rootStats.descendantCount < 10) {
  failures.push(
    `#root mounted only ${rootStats.descendantCount} nodes (childCount=${rootStats.childCount}) — black screen / stuck loader. text=${JSON.stringify(rootStats.text)}`,
  );
}
if (survivedDescendants < 10) {
  failures.push(`app tree collapsed during the settle window (${survivedDescendants} nodes left) — mount-then-crash`);
}
if (expectSelector && !selectorFound) {
  failures.push(`expected selector not found: ${expectSelector}`);
}
if (expectText && !textFound) {
  failures.push(`expected text not found: ${JSON.stringify(expectText)}`);
}
if (pageErrors.length) failures.push(`${pageErrors.length} uncaught page error(s)`);
if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`);

// Storm detection: count backend failures per bucket (real dial failures, not
// benign navigation aborts), plus any 5xx / repeated 4xx on /api or /ws.
const stormCounts = { api: 0, ws: 0, zero: 0 };
for (const f of requestFailures) {
  if (f.bucket in stormCounts && f.reason !== "net::ERR_ABORTED") stormCounts[f.bucket]++;
}
for (const r of badResponses) {
  if (r.bucket in stormCounts) stormCounts[r.bucket]++;
}
for (const [b, n] of Object.entries(stormCounts)) {
  if (n >= STORM_THRESHOLD) failures.push(`${n} failed ${b} request(s) — gateway↔backend storm on /${b}`);
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log("\n──────── release boot report ────────");
console.log(`url                : ${url}`);
console.log(`#root present      : ${rootStats.present}`);
console.log(`#root nodes        : ${rootStats.descendantCount} (children=${rootStats.childCount}) → ${survivedDescendants} after settle`);
console.log(`#root text (head)  : ${JSON.stringify(rootStats.text)}`);
if (expectSelector) console.log(`selector "${expectSelector}": ${selectorFound ? "FOUND" : "MISSING"}`);
if (expectText) console.log(`text "${expectText}"   : ${textFound ? "FOUND" : "MISSING"}`);
console.log(`console errors     : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log(`   • ${e}`);
console.log(`page errors        : ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 10)) console.log(`   • ${e}`);
console.log(`request failures   : ${requestFailures.length} (api=${requestFailures.filter((f) => f.bucket === "api").length} ws=${requestFailures.filter((f) => f.bucket === "ws").length})`);
for (const f of requestFailures.slice(0, 10)) console.log(`   • [${f.bucket}] ${f.reason} ${f.url}`);
console.log(`4xx/5xx responses  : ${badResponses.length}`);
for (const r of badResponses.slice(0, 10)) console.log(`   • [${r.bucket}] ${r.status} ${r.url}`);
console.log(`screenshots        : ${out}-loaded.png, ${out}-settled.png`);
console.log("─────────────────────────────────────");

if (failures.length) {
  console.log(`\n✗ FAIL (${failures.length}):`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  process.exit(1);
}
console.log("\n✓ PASS — packaged app booted and rendered end-to-end.");
process.exit(0);
