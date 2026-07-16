import { z } from "zod";

// The stall event class's snapshot section (persisted under
// snapshot.events.stall). It is the aggregate of the JSC sampling profiler's
// drained stacks over an event-loop freeze — NOT time-positioned bars, so the
// web lane renders it as a histogram card (the gates/contention shape).
//
// The freeze duration and wall time are intentionally NOT duplicated here: they
// are already `trigger.durationMs` (= eventLoopMaxMs) and the trace `wallTime`.
// This section is purely the stack evidence.
//
// This is the single source of truth for the section shape, shared by:
//   - the health-monitor sampler that builds it (from aggregateTraces),
//   - the server class that validates it,
//   - the web lane that parses it.

// One innermost-frame ("leaf") identity and how often samples sat there. `key`
// is `name @ path:line` for JS frames, `name [category]` for native frames.
export const StallLeafSchema = z.object({
  key: z.string(),
  count: z.number(),
  pct: z.number(),
});
export type StallLeaf = z.infer<typeof StallLeafSchema>;

// One collapsed, name-only call-path signature (innermost → outermost, `←`
// joined) and its sample frequency.
//
// `frames` carries the SAME frames resolved to full `frameKey` identities (the
// `name @ path:line` / `name [category]` form used by `StallLeaf.key`), in the
// same order. Invariant, enforced by construction in `aggregateTraces` and
// asserted in its tests:
//
//   frames[i] is the frameKey of the frame whose bare name is
//   stack.split(" ← ")[i]   — same slice, same order, same 40-frame cap.
//
// So `frames[0]` is always this stack's own leaf key.
//
// They are ONE representative sample's keys, not a canonical position for the
// path — `frame.line` is the sample's executing line, so traces sharing a
// name-only signature can resolve differently. Read `frames` as *a* position on
// the call path, not *the* position: enough to attribute it to a subsystem.
//
// Why both: `stack` stays name-only because it is the report's dedup grain —
// line-free and robust to edits. But a name-only signature cannot be attributed
// to a source location, and the two independent histograms (`topLeaves` vs
// `topStacks`) could never be cross-referenced: a label drawn from `topLeaves`
// may describe a DIFFERENT stall than the one `topStacks[0]` fingerprints. That
// really happened — a `spawn`-rooted freeze (46.7 % of samples) was titled with a
// 1-sample drizzle frame. `frames` restores the leaf↔stack association the
// aggregator used to discard, so a consumer can attribute the dominant stack
// using only that stack's own evidence.
//
// Optional: traces persisted before this field existed still parse.
export const StallStackSchema = z.object({
  stack: z.string(),
  count: z.number(),
  pct: z.number(),
  frames: z.array(z.string()).optional(),
});
export type StallStack = z.infer<typeof StallStackSchema>;

export const StallSectionSchema = z.object({
  // Total JSC stack samples drained for this freeze window.
  nSamples: z.number(),
  // Derived per-dump (nSamples / windowSeconds), never assumed.
  sampleRateHz: z.number(),
  topLeaves: z.array(StallLeafSchema),
  topStacks: z.array(StallStackSchema),
});
export type StallSection = z.infer<typeof StallSectionSchema>;
