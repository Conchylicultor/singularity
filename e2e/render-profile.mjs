// Headless React render-profiler run for agents diagnosing a re-render loop.
//
// Opens a URL, starts a profiling session, waits N seconds while the suspect
// screen renders/idles, then prints the ranked top-N initiating components +
// hooks to stdout. The same ranked report is also dumped to the per-worktree
// `render-profiler.jsonl` log channel by the engine on stop.
//
// Usage:
//   bun e2e/render-profile.mjs --url <url> [--seconds 8] [--top 12]
//
// Example:
//   bun e2e/render-profile.mjs \
//     --url http://claude-1776361358.localhost:9000/agents/c/claude-1776360729 \
//     --seconds 8

import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url");
const seconds = Number(arg("seconds", "8"));
const top = Number(arg("top", "12"));

if (!url) {
  console.error(
    "Usage: bun e2e/render-profile.mjs --url <url> [--seconds 8] [--top 12]",
  );
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

await page.goto(url);
// Let the app boot and install the global API (Core.Root installer).
await page.waitForTimeout(3000);

const hasApi = await page.evaluate(
  () => typeof window.__reactRenderProfiler !== "undefined",
);
if (!hasApi) {
  console.error(
    "window.__reactRenderProfiler is undefined — the commit bridge or the\n" +
      "render-profiler plugin is not loaded. Run ./singularity build and retry.",
  );
  await browser.close();
  process.exit(1);
}

// Give the session a little headroom over our own wait before it auto-stops.
const maxDurationMs = seconds * 1000 + 5000;
await page.evaluate(
  (ms) => window.__reactRenderProfiler.start({ maxDurationMs: ms }),
  maxDurationMs,
);
console.log(`profiling for ${seconds}s at ${url}`);
await page.waitForTimeout(seconds * 1000);

const report = await page.evaluate(() => {
  window.__reactRenderProfiler.stop();
  return window.__reactRenderProfiler.getReport();
});

// stop() dumps the ranked report to the `render-profiler` JSONL via clientLog,
// which debounces ~250ms before POSTing. Give it time to flush before closing.
await page.waitForTimeout(700);

const HOOK_LABEL = {
  state: "useState/useReducer",
  reducer: "useReducer",
  "external-store": "useSyncExternalStore",
  effect: "effect",
  "layout-effect": "layout effect",
  memo: "useMemo",
  callback: "useCallback",
  ref: "useRef",
  context: "context",
  unknown: "hook",
};

console.log("");
console.log(
  `total commits: ${report.totalCommits} · ${report.commitsPerSec.toFixed(1)}/s over ${(report.durationMs / 1000).toFixed(1)}s`,
);
const initiators = report.initiators.slice(0, top);
if (initiators.length === 0) {
  console.log("(no initiators recorded — the screen was idle / stable)");
} else {
  console.log("");
  for (const s of initiators) {
    const path = s.ancestorPath.length ? s.ancestorPath.join(" > ") + " > " : "";
    const hooks = s.changedHooks
      .map((h) => `${HOOK_LABEL[h.kind] ?? h.kind} #${h.index}`)
      .join(", ");
    const instances = s.instanceCount > 1 ? ` ×${s.instanceCount}` : "";
    console.log(
      `${s.commitCount.toString().padStart(5)}  ${s.ratePerSec.toFixed(1).padStart(5)}/s  ${path}${s.componentName}${instances}${hooks ? `  [${hooks}]` : ""}`,
    );
  }
}

await browser.close();
