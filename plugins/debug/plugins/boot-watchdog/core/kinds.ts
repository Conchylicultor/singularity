import { z } from "zod";

// The jsonb payload for a `boot-wedge` report. One report per distinct worktree
// (fingerprint `boot-wedge:<worktree>` — the row's own `worktree` column is
// always `main`, since the monitor job runs there, so the subject MUST live in
// the payload + fingerprint). The row `count` discriminates a one-off wedged
// boot from a crash-loop that never comes up (count grows across the watchdog's
// per-minute re-files while the boot stays open).
//
//   • `state: "superseded"` — the wedged attempt was replaced by a later boot
//     start (the outage is over; filed once, post-hoc, so it is on record).
//   • `state: "open"` — the attempt is the latest AND the gateway fleet still
//     lists the worktree as live, i.e. it is wedged RIGHT NOW; re-filed each
//     tick so `count` ≈ minutes wedged and the bell re-arms.
export const BootWedgePayloadSchema = z.object({
  worktree: z.string(),
  // Process-start epoch ms — the boot's identity, the pairing key with its
  // (missing) ready line.
  processStartedAt: z.number(),
  // Wall-time the boot has been un-ready: (supersededAtMs ?? now) − processStartedAt.
  wedgedMs: z.number(),
  state: z.enum(["open", "superseded"]),
  // Set only for a superseded wedge — the superseding attempt's start, which
  // bounds the outage.
  supersededAtMs: z.number().optional(),
  budgetMs: z.number(),
  // The gateway's reported state for the worktree at file time (open wedges
  // only) — presence in the fleet list is the "wedged-now vs torn-down"
  // discriminator; the string is the human hint.
  fleetState: z.string().optional(),
});
export type BootWedgePayload = z.infer<typeof BootWedgePayloadSchema>;
