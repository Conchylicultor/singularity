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
      // question three prior investigations answered wrong.
      cpu: z.object({
        deltaMs: z.number(),
        wallMs: z.number(),
        ratio: z.number(),
        verdict: z.enum(["spinning", "idle", "unknown"]),
      }),
      // The recursive child-process tree of the wedged pid. THE decisive
      // evidence: a live `git` child here means the CLI is parked awaiting a
      // child that never EOFs its stdout.
      children: z.array(
        z.object({
          pid: z.number(),
          ppid: z.number(),
          state: z.string(),
          etime: z.string(),
          command: z.string(),
        }),
      ),
      // Per-step failures (e.g. `sample` denied, `lsof` missing). Non-empty
      // means the capture is PARTIAL, and both the summary and the task say so
      // — a partial capture must never render as a complete one.
      failures: z.array(z.object({ step: z.string(), error: z.string() })),
    })
    .optional(),
});
export type OpWedgePayload = z.infer<typeof OpWedgePayloadSchema>;
