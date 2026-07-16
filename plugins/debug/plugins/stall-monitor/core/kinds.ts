import { z } from "zod";
import {
  StallLeafSchema,
  StallStackSchema,
} from "@plugins/debug/plugins/trace/plugins/stall/core";

// The jsonb payload for an `event-loop-stall` report — the alert-funnel twin of
// the `stall` trace. One report per distinct freeze cause (fingerprint
// `event-loop-stall:<culpritStack>`), so a recurring identical freeze collapses
// onto one row whose `count` is "how many times this stack froze the loop".
//
// Everything here is DERIVED from the existing `StallSection` (the trace
// evidence) at report time — `StallSection` stays purely the stack evidence, and
// the presentation grain (`culpritStack` / `hotFrame`) is computed in this plugin
// (see server/internal/culprit.ts). `topLeaves` / `topStacks` reuse the section's
// shapes verbatim (imported, never redeclared) so the report and the trace can
// never disagree on the histogram shape.
export const StallPayloadSchema = z.object({
  durationMs: z.number(),
  thresholdMs: z.number(),
  nSamples: z.number(),
  sampleRateHz: z.number(),
  // The dominant caller-path signature (topStacks[0].stack) — THE dedup grain.
  culpritStack: z.string(),
  // The human-readable label derived from THAT stack's own frames (`what ←
  // where`) — shown in the summary and the task title. NOT the fingerprint.
  hotFrame: z.string(),
  topLeaves: z.array(StallLeafSchema),
  topStacks: z.array(StallStackSchema),
  // Deep-link into the coherent-instant stall trace (Debug → Slow Events) when
  // captureTrace admitted one.
  traceId: z.string().optional(),
});
export type StallPayload = z.infer<typeof StallPayloadSchema>;
