import type { Registration } from "@plugins/framework/plugins/server-core/core";

/**
 * A declared heavy boot warm-up. Deferred past serving-ready and drained by
 * {@link drainWarmups} under a concurrency gate + heavy-read slot + macrotask
 * yield — never run eagerly from `onReady`.
 *
 * `defineWarmup` is the *declarative* contribution that makes "heavy boot work"
 * a structurally distinct, enforceable category (a `deferBootWork(fn)` called
 * from inside `onReady` would stay lint-invisible and couldn't carry `scope` as
 * a static property the executor reads).
 */
export interface WarmupSpec {
  /** Stable id → profiler span + budget-report dedup key. Must be unique. */
  name: string;
  /**
   * `host` ⇒ runs ONLY on the main backend (the `isMain()` gate) — the
   * N×-worktree-redundancy killer for host-global corpora/indexes. `worktree`
   * ⇒ runs on every backend, acting only on its own worktree state.
   */
  scope: "host" | "worktree";
  /**
   * The warm-up body. Awaited under the drain's heavy-read slot. A warm-up is
   * an OPTIMIZATION, never a correctness dependency — a throw is logged and the
   * drain continues (see {@link drainWarmups}). Consumers must work cold via
   * their own lazy on-demand refresh.
   */
  run: () => Promise<void>;
  /** Per-warmup wall-time budget (ms). Read by the boot-budget monitor. */
  budgetMs?: number;
}

/**
 * Module-load-time registry. Populated by `defineWarmup(...).register()` during
 * the framework's register phase (mounted by a consumer plugin via
 * `register: [warmupToken]`, exactly like `defineJob`). Drained once by
 * {@link drainWarmups} after the `onAllReady` barrier.
 */
export const warmupRegistry = new Map<string, WarmupSpec>();

/**
 * Declare a heavy boot warm-up. Returns a {@link Registration} that side-effects
 * into {@link warmupRegistry} at `register()` time — mirroring `defineJob`.
 * Mount it via `register: [<the returned token>]` on the consumer plugin's
 * `ServerPluginDefinition`.
 */
export function defineWarmup(spec: WarmupSpec): Registration {
  return {
    _kind: "warmup",
    _factory: "defineWarmup",
    _doc: { label: spec.name },
    register() {
      if (warmupRegistry.has(spec.name)) {
        throw new Error(`[warmup] duplicate warmup name: ${spec.name}`);
      }
      warmupRegistry.set(spec.name, spec);
    },
  };
}
