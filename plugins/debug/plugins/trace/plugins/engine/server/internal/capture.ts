import { randomUUID } from "node:crypto";
import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { getConfig } from "@plugins/config_v2/server";
import { traceConfig, type TraceTrigger, type TripContext } from "../../core";
import {
  TraceEventClass,
  getRing,
  type TraceEventClassSpec,
} from "./registry";
import { admitTrace } from "./rate-limit";
import { persistTrace } from "./persist-trace";

// ---------------------------------------------------------------------------
// THE generic entry point for capturing a trace. Any plugin may trigger — a slow
// span, a client signal, an op-time budget breach, a future GC-pause detector.
// Admission (enabled + cooldown + global cap) runs first; the synchronous
// capture phase runs inline (hot-path safe, coherent instant); enrich + validate
// + persist detach under runWithoutProfiling. Returns the minted id (for
// report/row linkage) or null when disabled / rate-limited. NEVER throws into
// the caller's hot path.
// ---------------------------------------------------------------------------
export function captureTrace(trigger: TraceTrigger): { id: string } | null {
  const cfg = getConfig(traceConfig);
  if (!cfg.enabled) return null;

  // Profiler-clock instant (performance.now domain — the same clock
  // captureFlightWindow and the class rings use), read once and shared so every
  // section describes the SAME instant.
  const atMs = performance.now();
  const key = `${trigger.kind}:${trigger.label}`;
  // Admission first, so a slow-event storm costs one Map lookup per trip. A
  // critical trigger (a frozen backend) bypasses the per-minute cap but still
  // honors its cooldown — never starved, never duplicated.
  if (!admitTrace(key, atMs, cfg.cooldownMs, cfg.maxPerMin, trigger.critical)) {
    return null;
  }

  // Mint the id synchronously so linkage (a report / a slow_ops sample) can
  // reference it before persistence even begins.
  const id = randomUUID();
  const ctx: TripContext = {
    id,
    atMs,
    wallTime: new Date().toISOString(),
    windowStartMs: atMs - Math.max(trigger.durationMs, cfg.windowMs),
    trigger,
  };

  const specs = TraceEventClass.getContributions();

  // Phase 1 — SYNCHRONOUS coherent-instant capture. No IO, no await between
  // admission and the last captureAtTrip, so every class reads the same instant.
  const atTripByClass = captureAtTripPhase(specs, ctx);

  // Phase 2 — detached async enrich + validate + persist, under
  // runWithoutProfiling so the engine's own IO (a class's async enrich query,
  // the insert) never re-feeds the profiler it was captured for. Fire-and-forget
  // by design: a failure surfaces as an unhandled rejection the reports plugin
  // captures — never silently swallowed.
  //
  // runInBackgroundLane on the outside declares that IO background for the DB
  // gate. captureTrace runs in the caller's hot path, so the detached chain would
  // otherwise inherit the tripping span's origin — a trace captured under a `sub`
  // load would take its connections from the reserved-interactive floor, at
  // precisely the moment the system is already saturated. Nobody awaits this
  // write. See research/2026-07-09-global-interactive-lane-origin-based-db-gating.md.
  void runInBackgroundLane(() =>
    runWithoutProfiling(async () => {
      const events = await assembleEvents(specs, ctx, atTripByClass);
      await persistTrace(ctx, events);
    }),
  );

  return { id };
}

// SYNCHRONOUS phase: run every class's captureAtTrip, each guarded so one
// throwing class never aborts the instant (or the others) — the noise-rules
// per-rule try/catch discipline. A class that returns undefined is skipped.
export function captureAtTripPhase(
  specs: TraceEventClassSpec[],
  ctx: TripContext,
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const spec of specs) {
    if (!spec.captureAtTrip) continue;
    try {
      const value = spec.captureAtTrip(ctx);
      if (value !== undefined) out.set(spec.id, value);
    } catch (err) {
      reportSectionError(spec.id, "captureAtTrip threw", err);
    }
  }
  return out;
}

// ASYNC phase: for each class, resolve its raw section (enrich | phase-1 output |
// ring slice), validate it against the class schema, and collect the validated
// value under events[id]. A section that throws or fails validation is OMITTED
// and a server error report is filed — loud (report) and isolated (like a slot
// error boundary): one bad class never kills the whole snapshot, never fakes a
// section.
export async function assembleEvents(
  specs: TraceEventClassSpec[],
  ctx: TripContext,
  atTripByClass: Map<string, unknown>,
): Promise<Record<string, unknown>> {
  const events: Record<string, unknown> = {};
  for (const spec of specs) {
    try {
      const atTrip = atTripByClass.get(spec.id);
      const ringSlice = getRing(spec.id)?.slice(ctx.windowStartMs, ctx.atMs) ?? [];

      let raw: unknown;
      if (spec.enrich) {
        raw = await spec.enrich(ctx, atTrip, ringSlice);
      } else if (atTrip !== undefined) {
        raw = atTrip;
      } else if (ringSlice.length > 0) {
        raw = ringSlice;
      } else {
        continue; // nothing to persist for this class at this trip
      }

      const parsed = spec.schema.safeParse(raw);
      if (!parsed.success) {
        reportSectionError(spec.id, "section failed validation", parsed.error);
        continue;
      }
      events[spec.id] = parsed.data;
    } catch (err) {
      reportSectionError(spec.id, "enrich threw", err);
    }
  }
  return events;
}

function reportSectionError(id: string, what: string, err: unknown): void {
  reportServerError({
    message: `trace class "${id}" ${what}: ${err instanceof Error ? err.message : String(err)}`,
    stack: err instanceof Error ? err.stack : null,
    errorType: "TraceClassError",
  });
}
