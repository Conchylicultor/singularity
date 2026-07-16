import { z } from "zod";
import { PROBE_VARIANTS, type ProbeSample } from "./probe-logic";

// The wire schema for one line of paging-probe-<variant>.jsonl. The probe writes
// these lines directly (it cannot import zod — see server/internal/probe/entry.ts's lean-closure
// header); this schema is the read contract for the tests and any future
// timeline consumer. Optional/nullable tolerance mirrors HealthSampleSchema: an
// old or lean line without touch*/gc* still safeParses, and a null memory column
// is a real "not measured" answer, not a dropped line.
export const ProbeSampleSchema = z.object({
  sampledAt: z.number(), // Date.now() ms epoch — the cross-file join key
  variant: z.enum(PROBE_VARIANTS), // derived from the tuple, never re-typed
  tickIndex: z.number(),
  eventLoopP50Ms: z.number(),
  eventLoopP99Ms: z.number(),
  eventLoopMaxMs: z.number(),
  lateByMs: z.number(), // headline freeze signal: actual - drift-free expected tick
  // Nullable, not optional: the probe ALWAYS writes these keys, but the FFI
  // degrades to null in place (unsupported platform / binding failure) — a null
  // must be distinguishable from a genuine 0 MB.
  physFootprintMb: z.number().nullable(),
  residentMb: z.number().nullable(),
  // Optional: only fat-touch ticks carry a touch measurement; lean / fat-idle
  // lines legitimately omit them, so safeParse must accept a line without them.
  touchMs: z.number().optional(),
  touchBytes: z.number().optional(),
  // Optional: only the once-a-minute GC tick (fat-touch, gcEachMinute) carries it.
  gcMs: z.number().optional(),
});

// BIDIRECTIONAL compile-time pin between the wire schema and the ProbeSample
// interface the probe constructs. A one-way assertion would let the two drift
// (a schema with a narrower field set is still assignable one direction); only
// both directions catch a missing AND an extra field. Precedent:
// debug/trace/plugins/spans/shared/flight-window.ts.
const _schemaMatchesSample: ProbeSample = {} as z.infer<typeof ProbeSampleSchema>;
const _sampleMatchesSchema: z.infer<typeof ProbeSampleSchema> = {} as ProbeSample;
void _schemaMatchesSample;
void _sampleMatchesSchema;

export type { ProbeSample };
