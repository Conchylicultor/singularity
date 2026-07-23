import { z } from "zod";

/**
 * The contract of the window-level imperative emit API.
 *
 * This lives in `core/` — not beside the installer in `web/internal/` — because
 * it has exactly two parties: the web module that INSTALLS the global, and the
 * headless e2e driver that CALLS it. (The global exists for the driver's sake;
 * see LIVE_STATE_EMIT_GLOBAL's comment in ./constants.) `e2e` may import `core`
 * but never `web` or `shared`, so a contract defined in `web/internal/` is
 * unreachable from the only other party to it — and duplicating the interface on
 * the e2e side produces two structurally-identical-but-distinct types augmenting
 * the same `Window` key, which TypeScript rejects (TS2717). One definition here,
 * referenced by both `declare global` blocks, is the single source of truth.
 */

/** Snapshot of the in-memory emit controller. */
export const EmitStatusSchema = z.object({
  active: z.boolean(),
  /** Resource key currently being emitted (null when idle). */
  key: z.string().nullable(),
  /** Configured pushes/sec. */
  rate: z.number(),
  startedAtMs: z.number().nullable(),
  endsAtMs: z.number().nullable(),
  /** Scheduled triggerResourcePush calls so far this session. */
  ticks: z.number(),
  /** Param-tuples reached on the last tick (0 = nobody listening → unobservable). */
  lastSubscriberCount: z.number(),
});
export type EmitStatus = z.infer<typeof EmitStatusSchema>;

/** Options for the window-level imperative `start`. */
export interface EmitStartOptions {
  key: string;
  rate: number;
  durationMs?: number;
}

/** The window-level imperative emit API installed by the web module. */
export interface LiveStateEmitGlobal {
  start: (opts: EmitStartOptions) => Promise<EmitStatus>;
  stop: () => Promise<EmitStatus>;
  status: () => Promise<EmitStatus>;
}
