import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";
import { recordSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { cpus } from "node:os";

function heavyReadSize(): number {
  const env = process.env.SINGULARITY_HEAVY_READ_CONCURRENCY;
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) return n;
  }
  return Math.max(1, Math.floor(cpus().length / 4));
}

const pool = createHostSemaphore({ name: "heavy-read", size: heavyReadSize() });

export function withHeavyReadSlot<T>(fn: () => Promise<T>): Promise<T> {
  return pool.run(fn, (waitMs) => recordSpan("db", "[heavy-read-acquire]", waitMs));
}
