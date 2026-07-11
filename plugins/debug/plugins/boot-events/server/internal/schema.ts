import { z } from "zod";

// Boot lines — two per boot since the `phase: "start"` cutover. All values are
// ms epoch; `processStartedAt` is Math.round(performance.timeOrigin) (process
// start), the pairing key between a boot's start and ready lines. `sampledAt`
// mirrors the health-sample convention (== the line's write time).
//
// `start` is written at the register phase — the earliest per-process plugin
// hook, before migrations and any `onReadyBlocking` work — so a backend that
// wedges mid-boot still left a mark. `ready` is written when `onReady` reaches
// this plugin (post-onReadyBlocking readiness). Pre-cutover lines carry no
// `phase` and parse as ready lines (the union's second arm).
export const BootLineSchema = z.union([
  z.object({
    sampledAt: z.number(),
    worktree: z.string(),
    processStartedAt: z.number(),
    phase: z.literal("start"),
  }),
  z.object({
    sampledAt: z.number(),
    worktree: z.string(),
    processStartedAt: z.number(),
    readyAt: z.number(),
    phase: z.literal("ready").optional(),
  }),
]);

export type BootLine = z.infer<typeof BootLineSchema>;

/**
 * One boot, as read back: the start/ready lines paired by `processStartedAt`.
 * `readyAt: null` = the backend never became ready — wedged or killed
 * mid-boot, or still booting right now. For a never-ready boot,
 * `supersededAtMs` is the next boot attempt's start time when one exists
 * (bounding the failed attempt) and null while the attempt is the latest
 * (rendered open-ended: possibly still booting, possibly wedged NOW).
 */
export interface BootEvent {
  worktree: string;
  processStartedAt: number;
  readyAt: number | null;
  supersededAtMs: number | null;
}
