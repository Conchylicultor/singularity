import { z } from "zod";

// One boot event — a backend boot rendered as the wall-clock interval
// [processStartedAt, readyAt]. All values are ms epoch. `processStartedAt` is
// Math.round(performance.timeOrigin) (process start); `readyAt` is when the
// `onReady` phase reached this plugin, i.e. post-onReadyBlocking readiness.
// `sampledAt` mirrors the health-sample convention (== readyAt here: the line
// is written at ready time).
export const BootEventSchema = z.object({
  sampledAt: z.number(),
  worktree: z.string(),
  processStartedAt: z.number(),
  readyAt: z.number(),
});

export type BootEvent = z.infer<typeof BootEventSchema>;
