import { z } from "zod";
import type { BootTrace } from "@plugins/primitives/plugins/perfs/plugins/boot-trace/core";

// The client-boot event class's snapshot section (persisted under
// snapshot.events["client-boot"]). It is the browser's own `BootTrace`
// (perfs/boot-trace) — the client-side decomposition of a slow page load —
// carried inside the page-load slow-op beacon, with ONE size guard: `assets`
// (the Resource Timing rows, unbounded on chunk-heavy pages) is capped to the
// top-N by transferSize and the remainder folded into `assetRollup`, so the
// beacon stays well under the 64KB fetch-keepalive cap while the full transfer
// cost is never silently dropped (the boot-profile Gantt's own cap+rollup rule,
// applied at the wire).
//
// All offsets are on the CLIENT's clock (performance.now() relative to the
// visiting tab's performance.timeOrigin) — the section renders on its own
// clock axis, never the trace window's (engine clock-domain rule).
//
// This is the single source of truth for the section shape, shared by:
//   - the slow-op collector that builds it (toClientBootSection below),
//   - the server class that validates it,
//   - the web lane that parses it.

const BootSpanSchema = z.object({
  id: z.string(),
  phase: z.enum([
    "navigation",
    "scripts",
    "main-thread",
    "boot-tasks",
    "resources",
    "assets",
    "paint",
  ]),
  label: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
  workMs: z.number().optional(),
  detail: z.string().optional(),
});

const NavTimingSchema = z.object({
  fetchStartMs: z.number(),
  domainLookupStartMs: z.number(),
  domainLookupEndMs: z.number(),
  connectStartMs: z.number(),
  connectEndMs: z.number(),
  requestStartMs: z.number(),
  responseStartMs: z.number(),
  responseEndMs: z.number(),
  domInteractiveMs: z.number(),
  domContentLoadedEndMs: z.number(),
});

const LongTaskSchema = z.object({
  startMs: z.number(),
  durationMs: z.number(),
  name: z.string(),
});

const AssetTimingSchema = z.object({
  name: z.string(),
  initiatorType: z.string(),
  startMs: z.number(),
  responseStartMs: z.number(),
  responseEndMs: z.number(),
  transferSize: z.number(),
  decodedBodySize: z.number(),
});

// Aggregate over ALL boot assets (kept + dropped), so the trimmed `assets`
// array never silently hides transfer cost.
export const AssetRollupSchema = z.object({
  // Total boot assets observed before the cap.
  count: z.number(),
  // Byte totals over every asset, not just the kept rows.
  transferSize: z.number(),
  decodedBodySize: z.number(),
  // How many assets the cap trimmed out of `assets`.
  droppedCount: z.number(),
});
export type AssetRollup = z.infer<typeof AssetRollupSchema>;

export const ClientBootSectionSchema = z.object({
  spans: z.array(BootSpanSchema),
  navigation: NavTimingSchema.nullable(),
  paint: z.object({
    firstPaintMs: z.number().nullable(),
    firstContentfulPaintMs: z.number().nullable(),
  }),
  firstCommitMs: z.number().nullable(),
  longTasks: z.array(LongTaskSchema),
  // Top-N assets by transferSize; the rest are summarized in `assetRollup`.
  assets: z.array(AssetTimingSchema),
  assetRollup: AssetRollupSchema,
  capturedAt: z.number(),
});
export type ClientBootSection = z.infer<typeof ClientBootSectionSchema>;

// Compile-time guard: the section minus its `assetRollup` must stay assignable
// to the canonical `BootTrace` (boot-trace/core) — this is exactly the
// reassembly the web lane performs before handing the section to
// `BootProfileGantt`. If `BootTrace` gains a field this mirror lacks (or a
// field's type drifts), this assignment fails `tsc`. The reverse direction —
// the mirror requiring something `BootTrace` lacks — is pinned by
// `toClientBootSection`'s parameter type below.
const _assertReassemblesBootTrace: BootTrace = {} as Omit<
  ClientBootSection,
  "assetRollup"
>;
void _assertReassemblesBootTrace;

/**
 * Pure trimmer from the in-memory `BootTrace` to the wire section: keeps the
 * top `maxAssets` assets by transferSize (the levers worth inspecting) and
 * folds the full byte totals + dropped count into `assetRollup`. Everything
 * else passes through untouched. Shared by the beacon builder (client), the
 * class validator's tests (server), and the lane's expectations (web), so the
 * trim can never drift between them.
 */
export function toClientBootSection(
  trace: BootTrace,
  maxAssets = 20,
): ClientBootSection {
  let transferSize = 0;
  let decodedBodySize = 0;
  for (const a of trace.assets) {
    transferSize += a.transferSize;
    decodedBodySize += a.decodedBodySize;
  }
  const kept = [...trace.assets]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, maxAssets);
  return {
    spans: trace.spans,
    navigation: trace.navigation,
    paint: trace.paint,
    firstCommitMs: trace.firstCommitMs,
    longTasks: trace.longTasks,
    assets: kept,
    assetRollup: {
      count: trace.assets.length,
      transferSize,
      decodedBodySize,
      droppedCount: Math.max(0, trace.assets.length - maxAssets),
    },
    capturedAt: trace.capturedAt,
  };
}
