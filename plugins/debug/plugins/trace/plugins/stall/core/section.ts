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
export const StallStackSchema = z.object({
  stack: z.string(),
  count: z.number(),
  pct: z.number(),
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
