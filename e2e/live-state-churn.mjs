// Headless deterministic live-state churn repro for agents diagnosing push-driven
// re-render storms / DOM thrash.
//
// Opens a URL, installs a MutationObserver before page JS, then drives a steady
// cadence of synthetic no-op live-state pushes (via window.__liveStateEmit) for a
// chosen resource key while the React render-profiler records commits. Prints the
// total DOM mutations + ranked top initiating components/hooks — a controlled,
// repeatable measurement that no longer depends on whether real pushes happen to
// be flowing.
//
// Usage:
//   bun e2e/live-state-churn.mjs --url <url> --key <resourceKey> [--rate 10] [--seconds 8]
//
// Example:
//   bun e2e/live-state-churn.mjs \
//     --url http://claude-1776361358.localhost:9000/agents \
//     --key tasks.list --rate 10 --seconds 8

import { chromium } from "playwright";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg("url");
const key = arg("key");
const rate = Number(arg("rate", "10"));
const seconds = Number(arg("seconds", "8"));

if (!url || !key) {
  console.error(
    "Usage: bun e2e/live-state-churn.mjs --url <url> --key <resourceKey> [--rate 10] [--seconds 8]",
  );
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

try {
  // Install a MutationObserver BEFORE page JS so we count every added/removed
  // node from the very first paint (the perf.mjs addInitScript pattern).
  await page.addInitScript(() => {
    window.__domMutations = 0;
    try {
      new MutationObserver((records) => {
        for (const r of records) {
          window.__domMutations += r.addedNodes.length + r.removedNodes.length;
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  });

  await page.goto(url);
  // Let the app boot and install the global APIs (Core.Root installers).
  await page.waitForTimeout(3000);

  const hasApi = await page.evaluate(
    () =>
      typeof window.__liveStateEmit !== "undefined" &&
      typeof window.__reactRenderProfiler !== "undefined",
  );
  if (!hasApi) {
    console.error(
      "window.__liveStateEmit and/or window.__reactRenderProfiler are undefined —\n" +
        "the live-state-churn emit and render-profiler Debug plugins are not loaded.\n" +
        "Run ./singularity build and retry.",
    );
    await browser.close();
    process.exit(1);
  }

  // Start emission. start() does a fetch (returns a promise) — await it.
  // Give emission headroom over our own wait before its server-side auto-stop.
  const emitDurationMs = (seconds + 5) * 1000;
  const emitStatus = await page.evaluate(
    ({ key, rate, durationMs }) =>
      window.__liveStateEmit.start({ key, rate, durationMs }),
    { key, rate, durationMs: emitDurationMs },
  );

  if (emitStatus && emitStatus.lastSubscriberCount === 0) {
    console.warn(
      `\n!! WARNING: nobody is subscribed to "${key}" on this route.\n` +
        `   lastSubscriberCount === 0 — the synthetic pushes are unobservable, so\n` +
        `   this run will measure nothing. Point --url at a view that renders the\n` +
        `   resource, or pick a key with active subscribers.\n`,
    );
  }

  // Start the render profiler with headroom over our own wait before it auto-stops.
  const maxDurationMs = (seconds + 2) * 1000;
  await page.evaluate(
    (ms) => window.__reactRenderProfiler.start({ maxDurationMs: ms }),
    maxDurationMs,
  );

  console.log(
    `emitting "${key}" at ${rate}/s and profiling for ${seconds}s at ${url}`,
  );
  await page.waitForTimeout(seconds * 1000);

  const report = await page.evaluate(() => {
    window.__reactRenderProfiler.stop();
    return window.__reactRenderProfiler.getReport();
  });
  await page.evaluate(() => window.__liveStateEmit.stop());
  const mutations = await page.evaluate(() => window.__domMutations);

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
  console.log("=== live-state churn summary ===");
  console.log(`resource key:     ${key}`);
  console.log(`push rate:        ${rate}/s (scheduled)`);
  console.log(`observed:         ${seconds}s`);
  console.log(`DOM mutations:    ${mutations} total`);
  console.log(`                  ${(mutations / seconds).toFixed(1)}/s`);
  console.log(
    `total commits:    ${report.totalCommits} · ${report.commitsPerSec.toFixed(1)}/s over ${(report.durationMs / 1000).toFixed(1)}s`,
  );

  const top = 12;
  const initiators = report.initiators.slice(0, top);
  if (initiators.length === 0) {
    console.log("");
    console.log("(no initiators recorded — the screen was idle / stable)");
  } else {
    console.log("");
    console.log("top render initiators:");
    for (const s of initiators) {
      const path = s.ancestorPath.length
        ? s.ancestorPath.join(" > ") + " > "
        : "";
      const hooks = s.changedHooks
        .map((h) => `${HOOK_LABEL[h.kind] ?? h.kind} #${h.index}`)
        .join(", ");
      const instances = s.instanceCount > 1 ? ` ×${s.instanceCount}` : "";
      const mu = ` (${s.mountCount}m/${s.updateCount}u)`;
      console.log(
        `${s.commitCount.toString().padStart(5)}  ${s.ratePerSec.toFixed(1).padStart(5)}/s  ${path}${s.componentName}${instances}${mu}${hooks ? `  [${hooks}]` : ""}`,
      );
    }
  }

  const remounts = (report.remounts ?? []).slice(0, top);
  console.log("");
  console.log("remounts:");
  if (report.remountTruncated) {
    console.log("(position map hit its cap — some remounts may be missed)");
  }
  if (remounts.length === 0) {
    console.log("(no remounts recorded — nothing destroyed-and-rebuilt)");
  } else {
    for (const r of remounts) {
      const path = r.ancestorPath.length
        ? r.ancestorPath.join(" > ") + " > "
        : "";
      console.log(
        `${r.count.toString().padStart(5)}  ${path}${r.fromType} > ${r.toType}  [${r.cause}]`,
      );
    }
  }

  console.log("");
} finally {
  await browser.close();
}
