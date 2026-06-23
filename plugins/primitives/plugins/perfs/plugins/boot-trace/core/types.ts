// The boot-trace data model. Pure type definitions shared across runtimes: the
// web store records and assembles them; the server persists snapshots of them
// (boot-profile permalinks). Server-side persistence must not import a web
// barrel, so the shapes live in this cross-runtime core leaf and the web store
// re-exports them for existing web consumers.

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
