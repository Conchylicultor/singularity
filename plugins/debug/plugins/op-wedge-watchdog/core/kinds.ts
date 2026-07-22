import { z } from "zod";

// The jsonb payload for a `cli-op-wedge` report — one per WEDGED PROCESS,
// fingerprinted `cli-op-wedge:<worktree>:<op>:<pid>`. The row's own `worktree`
// column is always `main` (the monitor job runs there, see the plugin's
// CLAUDE.md), so the subject MUST live in the fingerprint + payload.
//
// The pid is part of the identity on purpose: a wedge is a specific process
// that is stuck, and `(worktree, op)` alone would collapse two genuinely
// different wedges (one yesterday, one now) onto one row and suppress the
// second capture. Pid reuse across a main-process lifetime is not a practical
// concern here — a reused pid running a *different* wedged op of the same kind
// in the same worktree is the only collision, and it would merely bump `count`
// on an already-relevant row.
export const OpWedgePayloadSchema = z.object({
  worktree: z.string(),
  // "build" | "check" | "push" — kept a free string rather than an enum so a
  // future op kind reaches the report instead of failing payload validation.
  op: z.string(),
  pid: z.number(),
  // ISO instant the CLI op marker was written (op start).
  startedAt: z.string(),
  // now − startedAt at file time.
  wedgedMs: z.number(),
  budgetMs: z.number(),

  // --- capture ------------------------------------------------------------
  // Absent when the `capture` config toggle is off — the report then says so
  // explicitly rather than reading as a complete-but-empty capture.
  capture: z
    .object({
      // Absolute path of the durable forensics dump.
      dumpPath: z.string(),
      // Whether the process was still alive at the END of the capture.
      alive: z.boolean(),
      // The spin-vs-block verdict, derived from a CPU-time DELTA across two
      // samples — never from a single misreadable %CPU number. This is the
      // question three prior investigations answered wrong. Tree-aware since
      // the 2026-07-22 m0gj incident: the delta is taken for the marker AND
      // every descendant; `spinning` means SOME pid in the tree burns (the
      // specimen), `idle` means none does. The numbers here are the specimen's.
      cpu: z.object({
        deltaMs: z.number(),
        wallMs: z.number(),
        ratio: z.number(),
        verdict: z.enum(["spinning", "idle", "unknown"]),
      }),
      // The process the evidence chases: the max-ratio spinning member of
      // marker∪descendants, falling back to the marker pid when nothing spins.
      // `inspect` is parsed from the specimen's own argv — a marker-less
      // descendant (push-nested check) carries its own pre-armed URL there.
      // Optional: rows filed before specimen targeting lack it.
      specimen: z
        .object({
          pid: z.number(),
          command: z.string(),
          cpuRatio: z.number(),
          inspect: z.string().nullable(),
        })
        .optional(),
      // The recursive child-process tree of the wedged pid. THE decisive
      // evidence: a live `git` child here means the CLI is parked awaiting a
      // child that never EOFs its stdout; a high-`cpuRatio` descendant means
      // the wedge is a marker-less child, not the marker. `cpuPct`/`cpuRatio`
      // are optional so pre-existing rows still parse.
      children: z.array(
        z.object({
          pid: z.number(),
          ppid: z.number(),
          state: z.string(),
          etime: z.string(),
          command: z.string(),
          // ps lifetime-average %CPU — context only, never a verdict input.
          cpuPct: z.string().optional(),
          // Sampled delta ratio over the capture window; null = not computable.
          cpuRatio: z.number().nullable().optional(),
        }),
      ),
      // Per-step failures (e.g. `sample` denied, `lsof` missing). Non-empty
      // means the capture is PARTIAL, and both the summary and the task say so
      // — a partial capture must never render as a complete one.
      failures: z.array(z.object({ step: z.string(), error: z.string() })),
    })
    .optional(),

  // --- JS interrogation -----------------------------------------------------
  // Present when the jsProbe config toggle is on. `armed: false` records that
  // the marker carried no inspector URL (op predates the pre-armed inspector or
  // arming was disabled) — an absent probe must never read as an empty one.
  // The raw interrogation JSON + the second lsof land in the capture dump; only
  // this compact summary rides the payload.
  jsProbe: z
    .object({
      armed: z.boolean(),
      wsUrl: z.string().nullable(),
      // Sampled JS stack traces over the probe window. A wedge whose burn is a
      // native microtask storm shows few traces, dominated by
      // `processTicksAndRejections` at the drainMicrotasks() call site — see
      // research/2026-07-22-global-cli-op-wedge-named-function.md.
      traceCount: z.number().nullable(),
      topStacks: z.array(z.object({ stack: z.string(), count: z.number() })),
      // Heap growth across the window; ~zero for the known storm (steady-state).
      heapDelta: z
        .object({ wallMs: z.number(), heapBytes: z.number(), objects: z.number() })
        .nullable(),
      failures: z.array(z.object({ step: z.string(), error: z.string() })),
    })
    .optional(),

  // --- reap -----------------------------------------------------------------
  // Present when the reap config toggle decided the tree's fate. Tree-shaped
  // since the 2026-07-22 m0gj incident: the reap covers the marker pid AND every
  // captured descendant (deepest-first, marker last, identity-verified), so the
  // payload records one outcome per targeted pid plus a rollup. `disabled` is
  // recorded explicitly so the report states the processes were left alive.
  //
  // The LEGACY single-outcome arm exists only so rows filed before tree-reap
  // still parse in renderTask; delete it once those rows age out.
  reap: z
    .union([
      z.object({
        outcomes: z.array(
          z.object({
            pid: z.number(),
            role: z.enum(["marker", "descendant"]),
            outcome: z.enum([
              "exited-sigterm",
              "exited-sigkill",
              "survived",
              "already-dead",
              "identity-mismatch",
              "vanished",
            ]),
            failures: z.array(z.object({ step: z.string(), error: z.string() })),
          }),
        ),
        rollup: z.enum(["all-reaped", "some-survived", "disabled"]),
        failures: z.array(z.object({ step: z.string(), error: z.string() })),
      }),
      z.object({
        outcome: z.enum(["exited-sigterm", "exited-sigkill", "survived", "already-dead", "disabled"]),
        failures: z.array(z.object({ step: z.string(), error: z.string() })),
      }),
    ])
    .optional(),
});
export type OpWedgePayload = z.infer<typeof OpWedgePayloadSchema>;
