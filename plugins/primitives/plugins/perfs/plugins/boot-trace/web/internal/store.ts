// Module-level boot-span store. Imported eagerly during framework boot so the
// store is live before any resource mounts. Everything shares one clock:
// `performance.now()` is relative to `performance.timeOrigin` (≈ navigationStart),
// and Navigation/Paint Timing entries are already on that same epoch — so no
// custom epoch wiring is needed.

export type BootPhase =
  | "navigation"
  | "scripts"
  | "main-thread"
  | "boot-tasks"
  | "resources"
  | "assets"
  | "paint";

export interface BootSpan {
  id: string;
  phase: BootPhase;
  label: string;
  startMs: number; // performance.now() at start (relative to performance.timeOrigin)
  durationMs: number;
  workMs?: number; // server actual work; wait = durationMs - workMs (gated resources)
  detail?: string;
}

export interface NavTiming {
  // Pre-request phases (relative to navigationStart = 0). These decompose the
  // 0→first-byte window: a slow document response (cold/restarting backend,
  // contention) otherwise shows up as "TTFB at +2s with nothing before it".
  fetchStartMs: number; // after unload of the previous doc + redirects
  domainLookupStartMs: number;
  domainLookupEndMs: number;
  connectStartMs: number;
  connectEndMs: number;
  requestStartMs: number;
  responseStartMs: number; // first byte of index.html (TTFB)
  responseEndMs: number;
  domInteractiveMs: number;
  domContentLoadedEndMs: number;
}

/**
 * A main-thread Long Task (≥50ms): the parse/compile/eval/render work that
 * blocks the main thread between bytes-arrived and first paint. This is the
 * "blind spot" the span store can't capture itself — JS instrumentation can't
 * run while the thread is blocked — so it comes from the Long Tasks API.
 */
export interface LongTask {
  startMs: number;
  durationMs: number;
  /** Long Tasks attribution name (usually "self" for same-origin script work). */
  name: string;
}

/** A boot-time downloaded asset (script / stylesheet) from Resource Timing. */
export interface AssetTiming {
  name: string;
  initiatorType: string;
  startMs: number;
  responseStartMs: number; // first byte of the asset (download start)
  responseEndMs: number; // asset fully downloaded
  transferSize: number; // bytes over the wire
  decodedBodySize: number; // bytes after decompression
}

export interface BootTrace {
  spans: BootSpan[];
  navigation: NavTiming | null;
  paint: { firstPaintMs: number | null; firstContentfulPaintMs: number | null };
  firstCommitMs: number | null; // first React commit timestamp (performance.now-relative)
  longTasks: LongTask[]; // main-thread blocking during the boot window
  assets: AssetTiming[]; // scripts + stylesheets downloaded during boot
  capturedAt: number;
}

const spans: BootSpan[] = [];
const longTasks: LongTask[] = [];
let firstCommitMs: number | null = null;

// Subscribers re-read getBootTrace() when late timing (FCP / first-paint) or new
// spans arrive. Hoisted function declarations let the boot-time IIFEs below call
// notify() even though they appear earlier in source order.
const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

/**
 * Subscribe to boot-trace updates. The callback fires when late paint timing
 * (FCP / first-paint) lands, the first React commit is stamped, or a new span is
 * recorded — letting a mounted view re-read getBootTrace(). Returns an unsubscribe.
 */
export function subscribeBootTrace(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Explicit push (used for resource wait/work spans carrying a server `workMs`). */
export function recordBootSpan(span: BootSpan): void {
  spans.push(span);
  notify();
}

/**
 * Open a span now and return a closer. Calling the closer records the span with
 * its measured duration. The single clock means `startMs` is simply
 * `performance.now()` at the open instant.
 */
export function startBootSpan(id: string, phase: BootPhase, label: string): () => void {
  const startMs = performance.now();
  return () => {
    recordBootSpan({ id, phase, label, startMs, durationMs: performance.now() - startMs });
  };
}

/** Record a 0-duration marker span at the current instant. */
export function markBootInstant(id: string, phase: BootPhase, label: string): void {
  recordBootSpan({ id, phase, label, startMs: performance.now(), durationMs: 0 });
}

function readNavTiming(): NavTiming | null {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (!entry) return null;
  // All fields are already relative to `timeOrigin`, so use them directly.
  return {
    fetchStartMs: entry.fetchStart,
    domainLookupStartMs: entry.domainLookupStart,
    domainLookupEndMs: entry.domainLookupEnd,
    connectStartMs: entry.connectStart,
    connectEndMs: entry.connectEnd,
    requestStartMs: entry.requestStart,
    responseStartMs: entry.responseStart,
    responseEndMs: entry.responseEnd,
    domInteractiveMs: entry.domInteractive,
    domContentLoadedEndMs: entry.domContentLoadedEventEnd,
  };
}

function readPaintTiming(): { firstPaintMs: number | null; firstContentfulPaintMs: number | null } {
  const entries = performance.getEntriesByType("paint");
  const find = (name: string) => entries.find((e) => e.name === name)?.startTime ?? null;
  return {
    firstPaintMs: find("first-paint"),
    firstContentfulPaintMs: find("first-contentful-paint"),
  };
}

function readAssets(): AssetTiming[] {
  // Resource Timing is retained on the timeline and readable at any time, so —
  // unlike the span store — it covers the pre-boot-trace window (the eager
  // bundle + the plugin-chunk fan-out). Keep only scripts/stylesheets; /api and
  // /ws fetches are already represented as resource-phase spans.
  return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((e) => e.initiatorType === "script" || e.initiatorType === "link" || e.initiatorType === "css")
    .map((e) => ({
      name: e.name,
      initiatorType: e.initiatorType,
      startMs: e.startTime,
      responseStartMs: e.responseStart,
      responseEndMs: e.responseEnd,
      transferSize: e.transferSize,
      decodedBodySize: e.decodedBodySize,
    }));
}

/**
 * When boot "ends" on the shared clock — the later of first-contentful-paint and
 * the first React commit. The single source of truth so the long-task phase and
 * the cost summary agree on which tasks count as boot (vs. later interaction).
 * Returns 0 when neither is known yet (caller should then not clip).
 */
export function bootWindowEnd(trace: BootTrace): number {
  return Math.max(trace.paint.firstContentfulPaintMs ?? 0, trace.firstCommitMs ?? 0);
}

/** Assemble the current trace. Navigation/paint/assets are read lazily at call time. */
export function getBootTrace(): BootTrace {
  return {
    spans: [...spans],
    navigation: readNavTiming(),
    paint: readPaintTiming(),
    firstCommitMs,
    longTasks: [...longTasks],
    assets: readAssets(),
    capturedAt: performance.now(),
  };
}

// --- First React commit capture (one-shot, at module eval time) --------------
// The commit bridge installed by `web-core/web/index.html` exposes a
// `__commitSubscribers` Set on the DevTools global hook; each subscriber is
// invoked with the committed root on every React commit. We subscribe once,
// stamp the first-commit time, and remove ourselves. This must NEVER throw and
// brick boot — the hook/Set may not exist, so guard defensively.
(function captureFirstCommit() {
  try {
    const hook = (
      window as unknown as {
        __REACT_DEVTOOLS_GLOBAL_HOOK__?: { __commitSubscribers?: Set<(root: unknown) => void> };
      }
    ).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const subscribers = hook?.__commitSubscribers;
    if (!subscribers) return;
    const onCommit = () => {
      firstCommitMs = performance.now();
      markBootInstant("first-commit", "paint", "First React commit");
      subscribers.delete(onCommit);
      notify();
    };
    subscribers.add(onCommit);
    // eslint-disable-next-line promise-safety/no-bare-catch -- boot-path instrumentation must never throw and brick boot; the commit bridge is best-effort, so any failure to install the one-shot subscriber is safe to drop (the trace simply lacks firstCommitMs).
  } catch (err) {
    void err;
  }
})();

// --- Paint timing observer (buffered) ----------------------------------------
// first-paint / first-contentful-paint entries land AFTER mount (and after the
// boot-profile page first reads getBootTrace()), so a one-shot read misses them.
// A buffered PerformanceObserver replays any already-recorded paint entries and
// fires on new ones, notifying subscribers to re-read. This must NEVER throw and
// brick boot — PerformanceObserver/paint may be unsupported, so guard defensively.
(function observePaint() {
  try {
    const obs = new PerformanceObserver(() => notify());
    obs.observe({ type: "paint", buffered: true });
    // eslint-disable-next-line promise-safety/no-bare-catch -- boot-path instrumentation must never throw; PerformanceObserver/paint may be unsupported, in which case FCP simply stays null until a manual Refresh.
  } catch (err) {
    void err;
  }
})();

// --- Long task observer (buffered) -------------------------------------------
// The main-thread blocking that fills the bytes-arrived → first-paint gap (bundle
// parse/compile/eval, plugin-chunk fan-out, the first React render) happens while
// the span store can't run. The Long Tasks API records those ≥50ms tasks
// independently; `buffered: true` replays the ones that fired before this module
// evaluated. Must NEVER throw and brick boot — longtask may be unsupported.
(function observeLongTasks() {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks.push({ startMs: e.startTime, durationMs: e.duration, name: e.name });
      }
      notify();
    });
    obs.observe({ type: "longtask", buffered: true });
    // eslint-disable-next-line promise-safety/no-bare-catch -- boot-path instrumentation must never throw; the Long Tasks API may be unsupported, in which case the main-thread phase simply stays empty.
  } catch (err) {
    void err;
  }
})();
