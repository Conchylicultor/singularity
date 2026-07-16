// Pure, dependency-free logic lifted out of server/internal/probe/entry.ts so the drift-free
// lateByMs arithmetic and the touch-slice picker are unit-pinnable in isolation.
//
// This file imports NOTHING — not even a node builtin. Two consumers depend on
// that: server/internal/probe/entry.ts needs a lean closure (see its header — importing anything
// heavy would bloat the probe's own heap and destroy the measurement), and
// core/schema.ts pulls `PROBE_VARIANTS` + the `ProbeSample` type from here into
// the web/server bundle, so this must stay safe to include anywhere.

// The three probe variants. `core/schema.ts` derives its `z.enum` from this
// tuple (never re-typed), and `parseProbeArgs` validates argv against it.
export const PROBE_VARIANTS = ["lean", "fat-idle", "fat-touch"] as const;
export type ProbeVariant = (typeof PROBE_VARIANTS)[number];

// The wire/construction shape of one probe sample. The zod schema in
// core/schema.ts is pinned bidirectionally against this interface, so the two
// cannot drift; server/internal/probe/entry.ts constructs samples typed against it directly
// (it cannot import zod). `physFootprint`/`resident` are nullable — a null is a
// real "not measured on this platform/tick" answer the FFI writes in place,
// distinct from a genuine 0. `touch*`/`gc*` are optional — only fat-touch ticks
// (and, for gc, the once-a-minute tick) carry them.
export interface ProbeSample {
  sampledAt: number;
  variant: ProbeVariant;
  tickIndex: number;
  eventLoopP50Ms: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  lateByMs: number;
  physFootprintMb: number | null;
  residentMb: number | null;
  touchMs?: number;
  touchBytes?: number;
  gcMs?: number;
}

// Fixed 10 s tick cadence. Not config: the drift-free lateByMs arithmetic and
// the "once per minute" GC cadence (every 6th tick) both key off this constant,
// and the histogram window is meaningless if it moves per run.
export const TICK_MS = 10_000;

export interface ProbeArgs {
  variant: ProbeVariant;
  fatSizeMb: number;
  touchSliceMb: number;
  gcEachMinute: boolean;
  boostQos: boolean;
  outPath: string;
}

export function isProbeVariant(value: string): value is ProbeVariant {
  return (PROBE_VARIANTS as readonly string[]).includes(value);
}

const KNOWN_FLAGS = new Set([
  "--fat-size-mb",
  "--touch-slice-mb",
  "--gc-each-minute",
  "--boost-qos",
  "--out",
]);

function requireNonNegInt(flags: ReadonlyMap<string, string>, key: string): number {
  const raw = flags.get(key);
  if (raw === undefined) throw new Error(`${key} <n> is required`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${key} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

function requireBool(flags: ReadonlyMap<string, string>, key: string): boolean {
  const raw = flags.get(key);
  if (raw === "1") return true;
  if (raw === "0") return false;
  throw new Error(`${key} must be 0 or 1, got ${JSON.stringify(raw)}`);
}

// Strict argv parse: `<variant> --fat-size-mb N --touch-slice-mb N
// --gc-each-minute 0|1 --boost-qos 0|1 --out <path>`. Pass process.argv.slice(2).
// Any unknown variant, unknown flag, missing value, or missing required flag
// throws — a mis-spawned probe must fail loudly, never sample with silent
// defaults that would poison the experiment.
export function parseProbeArgs(argv: readonly string[]): ProbeArgs {
  const [variant, ...rest] = argv;
  if (variant === undefined || !isProbeVariant(variant)) {
    throw new Error(
      `unknown or missing probe variant ${JSON.stringify(variant)}; expected one of ${PROBE_VARIANTS.join(", ")}`,
    );
  }
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === undefined || !KNOWN_FLAGS.has(key)) {
      throw new Error(`unknown flag ${JSON.stringify(key)}`);
    }
    if (value === undefined) throw new Error(`flag ${key} is missing its value`);
    flags.set(key, value);
  }
  const outPath = flags.get("--out");
  if (outPath === undefined || outPath.length === 0) {
    throw new Error("--out <jsonl-path> is required");
  }
  return {
    variant,
    fatSizeMb: requireNonNegInt(flags, "--fat-size-mb"),
    touchSliceMb: requireNonNegInt(flags, "--touch-slice-mb"),
    gcEachMinute: requireBool(flags, "--gc-each-minute"),
    boostQos: requireBool(flags, "--boost-qos"),
    outPath,
  };
}

// Drift-free expected wall-time of tick `tickIndex` (0-based), anchored to the
// first tick's actual time and advancing by exactly TICK_MS per tick. Anchoring
// to absolute (firstTickAt + tickIndex*TICK_MS) — not to the previous tick — is
// what makes a slow tick unable to smear the schedule forward.
export function expectedTickAt(
  firstTickAt: number,
  tickIndex: number,
  tickMs: number = TICK_MS,
): number {
  return firstTickAt + tickIndex * tickMs;
}

// The headline freeze signal: how many ms late this tick fired versus its
// drift-free expected time. A tick 3 s late means the probe process itself was
// frozen 3 s — a fair twin to main's event-loop stall. Clamped at 0 (an early
// tick is not lateness).
export function lateByMs(
  now: number,
  firstTickAt: number,
  tickIndex: number,
  tickMs: number = TICK_MS,
): number {
  return Math.max(0, now - expectedTickAt(firstTickAt, tickIndex, tickMs));
}

export interface TouchSlice {
  startChunk: number;
  endChunk: number; // exclusive
}

// Pick a random contiguous run of `sliceChunks` chunks within [0, chunkCount).
// `rand` is injected (Math.random by default) so the picker is deterministic
// under test. The run is clamped to fit — a slice at least as large as the heap
// touches all of it, and a zero/negative chunkCount yields an empty run.
export function pickTouchSlice(
  chunkCount: number,
  sliceChunks: number,
  rand: () => number = Math.random,
): TouchSlice {
  if (chunkCount <= 0) return { startChunk: 0, endChunk: 0 };
  const span = Math.min(Math.max(1, sliceChunks), chunkCount);
  const maxStart = chunkCount - span;
  const startChunk = maxStart <= 0 ? 0 : Math.floor(rand() * (maxStart + 1));
  return { startChunk, endChunk: startChunk + span };
}
