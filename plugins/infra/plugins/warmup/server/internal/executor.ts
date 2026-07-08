import { profilerStart } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { warmupRegistry, type WarmupSpec } from "./registry";
import { yieldServer } from "./yield-server";

/**
 * How many warm-ups may run at once. Kept deliberately small: warm-ups drain
 * *while the server is already serving requests*, so the cap (plus the heavy-read
 * slot and macrotask yield) keeps the drain from competing with first requests.
 * host-read-pool exposes no sizing helper for a fresh semaphore, so a small
 * constant it is.
 */
export const WARMUP_CONCURRENCY = 2;

/**
 * Injectable dependencies for {@link drainWarmupsWith} — the real wiring lives in
 * {@link drainWarmups}, the seam exists so tests can drive the executor with
 * stubbed `isMain` / slot / yield / registry (mirroring `usage-index.ts`'s
 * injectable-deps testability).
 */
export interface WarmupExecDeps {
  warmups: WarmupSpec[];
  isMain: () => boolean;
  withSlot: <T>(fn: () => Promise<T>) => Promise<T>;
  yieldServer: () => Promise<void>;
  concurrency: number;
}

/**
 * Drain the given warm-ups. Executor semantics (baked in, not per-consumer):
 * - `host`-scoped warm-ups are SKIPPED when `!isMain()` (kills N×-worktree
 *   redundancy on host-global work);
 * - each `run` is gated by a bounded `createSemaphore(concurrency)` and wrapped
 *   in `withSlot` (the host-wide heavy-read budget), with a macrotask
 *   `yieldServer()` before each so request IO/timers interleave;
 * - each is wrapped in a `warmup:<name>` profiler span for boot-Gantt visibility;
 * - a throw is NEVER fatal — a warm-up is an optimization, so it is logged and
 *   the drain continues (the boot-budget monitor separately flags slow/failed
 *   warm-ups).
 */
export async function drainWarmupsWith(deps: WarmupExecDeps): Promise<void> {
  const gate = createSemaphore(deps.concurrency);
  await Promise.all(
    deps.warmups.map((w) =>
      gate.run(async () => {
        if (w.scope === "host" && !deps.isMain()) return;
        // A real macrotask breath before each heavy unit — unlike a microtask
        // `await Promise.resolve()`, this admits queued request IO/timers.
        await deps.yieldServer();
        const end = profilerStart(`warmup:${w.name}`, "warmup", w.name, w.name);
        try {
          await deps.withSlot(() => w.run());
          // eslint-disable-next-line promise-safety/no-bare-catch -- a warm-up is an optimization, never a correctness dependency: every failure maps to the same handling (log loudly + keep draining the other warm-ups), so one bad warm-up can neither abort its siblings nor reject drainWarmups() into the post-serving boot path. Mirrors the framework's own onShutdown isolation loop in bin/index.ts.
        } catch (err) {
          console.error(`[warmup] ${w.name} failed`, err);
        } finally {
          end();
        }
      }),
    ),
  );
}

/**
 * Drain every registered warm-up. Called once by the server boot path
 * (`server-core/bin/index.ts`) immediately after the `onAllReady` barrier, so
 * all migrations and `onReady` state are settled. Wires the real host deps.
 */
export async function drainWarmups(): Promise<void> {
  await drainWarmupsWith({
    warmups: [...warmupRegistry.values()],
    isMain,
    withSlot: withHeavyReadSlot,
    yieldServer,
    concurrency: WARMUP_CONCURRENCY,
  });
}
