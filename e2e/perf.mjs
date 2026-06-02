// Standalone Playwright perf harness for Singularity — agent-readable frontend metrics.
//
// Installs PerformanceObservers before navigation (to catch LCP/CLS/longtask
// from the very first paint), then collects navigation timings, resource
// waterfall, and web vitals after the page settles.
//
// Usage:
//   bun e2e/perf.mjs --url <url> [--out <path>] [--wait-for-timeout <ms>] [--viewport-size "W,H"]
//
// Example:
//   bun e2e/perf.mjs \
//     --url http://att-1780408361-zzpk.localhost:9000/c/<id> \
//     --out /tmp/run
//
// Outputs:
//   - A concise summary table to stdout (so agents see it directly)
//   - `<out>-perf.json` — full structured data for deeper Read

import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Arg parsing (mirrors screenshot.mjs: arg(name, fallback) via process.argv)
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url");
const out = arg("out", "/tmp/perf");
const waitMs = Number(arg("wait-for-timeout", "3000"));
const viewportRaw = arg("viewport-size", "1280,800").split(",").map(Number);

if (!url) {
  console.error(
    "Usage: bun e2e/perf.mjs --url <url> [--out <path>] [--wait-for-timeout <ms>] [--viewport-size \"W,H\"]"
  );
  process.exit(2);
}

const viewport = { width: viewportRaw[0] ?? 1280, height: viewportRaw[1] ?? 800 };

// ---------------------------------------------------------------------------
// Browser launch (mirrors screenshot.mjs)
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({ viewport });
const page = await context.newPage();

// ---------------------------------------------------------------------------
// Collect browser console errors
// ---------------------------------------------------------------------------

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

// ---------------------------------------------------------------------------
// Install PerformanceObservers BEFORE navigation so buffered entries are seen
// ---------------------------------------------------------------------------

await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, longTasks: [] };

  // LCP — largest-contentful-paint
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.lcp = entry.renderTime || entry.loadTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (_) {}

  // CLS — layout-shift
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__perf.cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (_) {}

  // Long tasks
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.longTasks.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {}
});

// ---------------------------------------------------------------------------
// Navigate and wait
// ---------------------------------------------------------------------------

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(waitMs);

// ---------------------------------------------------------------------------
// Collect performance data from the page
// ---------------------------------------------------------------------------

const perfData = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource").map((e) => ({
    name: e.name,
    duration: Math.round(e.duration),
    transferSize: e.transferSize,
    initiatorType: e.initiatorType,
  }));
  return {
    navigation: nav ? nav.toJSON() : null,
    resources,
    vitals: window.__perf ?? { lcp: 0, cls: 0, longTasks: [] },
  };
});

await browser.close();

// ---------------------------------------------------------------------------
// Post-process
// ---------------------------------------------------------------------------

const { navigation, resources, vitals } = perfData;

// Slow API / WS resources (sorted by duration desc, top 20)
const slowApi = resources
  .filter((r) => r.name.includes("/api/") || r.name.includes("/ws"))
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 20);

// Top 20 slowest resources overall
const slowestAll = [...resources].sort((a, b) => b.duration - a.duration).slice(0, 20);

// ---------------------------------------------------------------------------
// Print human-readable summary to stdout
// ---------------------------------------------------------------------------

const nav = navigation ?? {};
const dcl = Math.round(nav.domContentLoadedEventEnd ?? 0);
const load = Math.round(nav.loadEventEnd ?? 0);
const ttfb = Math.round(nav.responseStart ?? 0);
const lcp = Math.round(vitals.lcp);
const cls = vitals.cls.toFixed(4);
const longTaskCount = vitals.longTasks.length;
const longTaskTotal = Math.round(vitals.longTasks.reduce((s, t) => s + t.duration, 0));

console.log("");
console.log("=== perf summary ===");
console.log(`url:              ${url}`);
console.log(`TTFB:             ${ttfb} ms`);
console.log(`DOMContentLoaded: ${dcl} ms`);
console.log(`load:             ${load} ms`);
console.log(`LCP:              ${lcp} ms`);
console.log(`CLS:              ${cls}`);
console.log(`long tasks:       ${longTaskCount} tasks, ${longTaskTotal} ms total`);

if (consoleErrors.length > 0) {
  console.log(`\nconsole errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) {
    console.log(`  [err] ${e.slice(0, 160)}`);
  }
}

if (slowApi.length > 0) {
  console.log(`\nslow /api + /ws calls (top ${slowApi.length}, sorted by duration):`);
  const colW = 60;
  console.log(`  ${"name".padEnd(colW)} | ${"dur ms".padStart(6)} | ${"xfer B".padStart(8)}`);
  console.log(`  ${"-".repeat(colW)} | ${"-".repeat(6)} | ${"-".repeat(8)}`);
  for (const r of slowApi) {
    const label = r.name.length > colW ? "…" + r.name.slice(-(colW - 1)) : r.name.padEnd(colW);
    console.log(`  ${label} | ${String(r.duration).padStart(6)} | ${String(r.transferSize).padStart(8)}`);
  }
} else {
  console.log("\nno /api or /ws resources captured");
}

if (slowestAll.length > 0) {
  console.log(`\ntop ${slowestAll.length} slowest resources (all types):`);
  const colW = 60;
  console.log(`  ${"name".padEnd(colW)} | ${"dur ms".padStart(6)} | type`);
  console.log(`  ${"-".repeat(colW)} | ${"-".repeat(6)} | ----`);
  for (const r of slowestAll) {
    const label = r.name.length > colW ? "…" + r.name.slice(-(colW - 1)) : r.name.padEnd(colW);
    console.log(`  ${label} | ${String(r.duration).padStart(6)} | ${r.initiatorType}`);
  }
}

console.log("");

// ---------------------------------------------------------------------------
// Write full structured data to JSON
// ---------------------------------------------------------------------------

const outPath = `${out}-perf.json`;
const report = {
  url,
  capturedAt: new Date().toISOString(),
  waitForTimeoutMs: waitMs,
  viewport,
  navigation,
  vitals: {
    lcp,
    cls: vitals.cls,
    longTaskCount,
    longTaskTotalMs: longTaskTotal,
    longTasks: vitals.longTasks,
  },
  slowApi,
  slowestResources: slowestAll,
  allResources: resources,
  consoleErrors,
};

await Bun.write(outPath, JSON.stringify(report, null, 2));
console.log(`wrote ${outPath}`);
