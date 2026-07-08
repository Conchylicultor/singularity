import { z } from "zod";
import type { SpanKind, FlightWindow } from "@plugins/infra/plugins/runtime-profiler/core";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";

// Web-side zod mirror of the profiler's FlightWindow. The detail endpoint
// validates the whole snapshot (events as an opaque classId→unknown record), so
// the spans section is NOT re-validated per-class on read — this parses it
// loudly here instead of casting `unknown`. Pinned to the source type by the
// compile-time assertion below (the same discipline the server class file uses).
const SpanRefSchema = z.object({
  kind: z.enum(["http", "db", "loader", "sub", "push", "flush", "job"]),
  label: z.string(),
});
const FlightSpanSchema = z.object({
  kind: z.enum(["http", "db", "loader", "sub", "push", "flush", "job"]),
  label: z.string(),
  t0: z.number(),
  t1: z.number().nullable(),
  ageMs: z.number(),
  parents: z.array(SpanRefSchema),
  waitMs: z.number(),
  childMs: z.number(),
  selfMs: z.number(),
  waits: z.record(z.number()).optional(),
});
const FlightWindowSchema = z.object({
  atMs: z.number(),
  open: z.array(FlightSpanSchema),
  completed: z.array(FlightSpanSchema),
});
const _assertFlightWindow: FlightWindow = {} as z.infer<typeof FlightWindowSchema>;
void _assertFlightWindow;

/** Parse the opaque `snapshot.events.spans` section, or null when absent/invalid. */
export function parseSpansSection(payload: unknown): FlightWindow | null {
  const parsed = FlightWindowSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// One positioned bar on a span lane. Window-relative `startMs`/`durationMs` drive
// the Gantt; the raw profiler-clock fields ride along for the detail strip.
export interface NormalizedBar {
  id: string;
  kind: SpanKind;
  label: string;
  /** Window-relative, clamped to [0, totalMs]. */
  startMs: number;
  durationMs: number;
  /** t1 === null at capture → still in flight (renders to the window edge, pulsing). */
  open: boolean;
  /** Leading wait segment + trailing work (completed spans with waitMs > 0). */
  segments?: { kind: "wait" | "work"; ms: number }[];
  // Raw, unclamped, profiler-clock detail for the bottom strip.
  t0: number;
  t1: number | null;
  ageMs: number;
  waitMs: number;
  childMs: number;
  selfMs: number;
  parents: { kind: string; label: string }[];
  waits?: Record<string, number>;
}

export interface NormalizedLane {
  /** `${kind}:${label}` — the row bucket key. */
  key: string;
  kind: SpanKind;
  label: string;
  bars: NormalizedBar[];
}

export interface NormalizedSpans {
  totalMs: number;
  lanes: NormalizedLane[];
}

const KIND_ORDER: SpanKind[] = ["http", "sub", "push", "flush", "loader", "job", "db"];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pure normalizer: fold a trace's `spans` flight window into per-(kind,label)
 * lanes of window-relative bars. Open spans extend to the window's right edge
 * (atMs); every bar is clamped into [0, totalMs] so a span that began before the
 * window still paints from the left edge. Completed spans with a positive
 * `waitMs` get a lighter LEADING wait segment sized `waitMs/durationMs` — an
 * approximation (waits are union totals, not intervals), labelled as such in the
 * detail strip.
 */
export function normalizeTrace(snapshot: TraceSnapshot): NormalizedSpans {
  const totalMs = Math.max(1, snapshot.atMs - snapshot.windowStartMs);
  const window = parseSpansSection(snapshot.events["spans"]);
  if (!window) return { totalMs, lanes: [] };

  const laneByKey = new Map<string, NormalizedLane>();

  const push = (span: FlightWindow["open"][number], group: "open" | "completed", i: number) => {
    const isOpen = span.t1 === null;
    const rawEnd = span.t1 ?? snapshot.atMs;
    const startMs = clamp(span.t0 - snapshot.windowStartMs, 0, totalMs);
    const endMs = clamp(rawEnd - snapshot.windowStartMs, startMs, totalMs);
    const durationMs = Math.max(0, endMs - startMs);

    let segments: NormalizedBar["segments"];
    if (!isOpen && span.waitMs > 0 && durationMs > 0) {
      const wait = clamp(span.waitMs, 0, durationMs);
      segments = [
        { kind: "wait", ms: wait },
        { kind: "work", ms: durationMs - wait },
      ];
    }

    const bar: NormalizedBar = {
      id: `${group}:${span.kind}:${span.label}:${i}`,
      kind: span.kind,
      label: span.label,
      startMs,
      durationMs,
      open: isOpen,
      segments,
      t0: span.t0,
      t1: span.t1,
      ageMs: span.ageMs,
      waitMs: span.waitMs,
      childMs: span.childMs,
      selfMs: span.selfMs,
      parents: span.parents,
      waits: span.waits,
    };

    const key = `${span.kind}:${span.label}`;
    let lane = laneByKey.get(key);
    if (!lane) {
      lane = { key, kind: span.kind, label: span.label, bars: [] };
      laneByKey.set(key, lane);
    }
    lane.bars.push(bar);
  };

  window.open.forEach((s, i) => push(s, "open", i));
  window.completed.forEach((s, i) => push(s, "completed", i));

  for (const lane of laneByKey.values()) {
    lane.bars.sort((a, b) => a.startMs - b.startMs);
  }

  const lanes = [...laneByKey.values()].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return a.label.localeCompare(b.label);
  });

  return { totalMs, lanes };
}
