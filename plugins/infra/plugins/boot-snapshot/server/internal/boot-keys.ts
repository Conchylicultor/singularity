import { Resource, loadResourceByKey } from "@plugins/framework/plugins/server-core/core";

// The boot-critical resource keys, read GENERICALLY from the shared collection —
// never by naming a specific resource (collection-consumer separation). A
// resource opts in at its declaration site with `Resource.Declare(r, { bootCritical: true })`.
export function bootCriticalKeys(): string[] {
  return Resource.Declare.getContributions()
    .filter((c) => c.bootCritical)
    .map((c) => c.key);
}

// Best-effort, time-boxed wrapper. Resolves (never rejects) to a sentinel when
// `ms` elapses so warm-up / snapshot loaders can be wrapped under
// `Promise.allSettled` without a pathological loader wedging the readiness
// barrier. The underlying promise keeps running but its result is ignored.
const TIMED_OUT = Symbol("boot-snapshot:timeout");
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Per-loader warm-up budget. The barrier holding a little longer is acceptable
// (the old backend keeps serving meanwhile — zero downtime) but must be bounded
// so no single loader can wedge the gateway's hot-swap.
const WARM_BUDGET_MS = 1500;

// Phase C — run the boot-critical loaders once behind the readiness barrier so
// PG's buffer cache + the connection pool are warm for the boot-critical tables
// BEFORE the gateway hot-swaps to this backend. Best-effort + time-boxed so a
// pathological loader can never hold the barrier open past the budget.
export async function warmBootResources(): Promise<void> {
  const keys = bootCriticalKeys();
  await Promise.allSettled(keys.map((k) => withTimeout(loadResourceByKey(k), WARM_BUDGET_MS)));
}
