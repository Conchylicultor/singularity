import { z } from "zod";

// The jsonb payload for an `op-rate` report. One report per distinct hot op
// (`${kind}:${label}`), so a single hammered op gets its own task pointing
// straight at the cause. The payload carries the call-rate snapshot that tripped
// the threshold: which op, how many calls landed in the window, how long the
// window was, and the per-kind threshold it exceeded.
export const OpRatePayloadSchema = z.object({
  kind: z.string(),
  label: z.string(),
  callsInWindow: z.number().int(),
  windowMs: z.number().int(),
  threshold: z.number().int(),
});
export type OpRatePayload = z.infer<typeof OpRatePayloadSchema>;

// The jsonb payload for an `op-time` report — the aggregate-time (count×cost)
// twin of op-rate. Two report shapes share this schema, discriminated by
// `label`:
//   • per-op    (`label` present) — ONE op burned `msInWindow` ms across
//     `callsInWindow` calls in the window, past its per-kind `budgetMs`. Carries
//     both ms AND calls so the renderer can state the rate×cost decomposition
//     ("N calls × ~M ms avg") and a `traceId` linking the coherent-instant flight
//     window captured at the trip.
//   • rollup    (`label` absent) — the sum of a kind's per-op ms deltas exceeded
//     `budgetMs` (= per-kind budget × rollupFactor), i.e. cost smeared across
//     many labels each under its own per-op budget. `topLabels` carries the
//     top-10 contributing labels with their ms deltas; no single op to point at,
//     so no `traceId`.
export const OpTimePayloadSchema = z.object({
  kind: z.string(),
  label: z.string().optional(),
  msInWindow: z.number(),
  callsInWindow: z.number().int(),
  windowMs: z.number().int(),
  budgetMs: z.number(),
  topLabels: z
    .array(z.object({ label: z.string(), deltaMs: z.number() }))
    .optional(),
  traceId: z.string().optional(),
});
export type OpTimePayload = z.infer<typeof OpTimePayloadSchema>;
