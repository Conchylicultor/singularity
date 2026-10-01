import noUntrackedDetachedWork from "./no-untracked-detached-work";
import noRawSetInterval from "./no-raw-set-interval";

export default {
  name: "detached-work-safety",
  rules: {
    "no-untracked-detached-work": noUntrackedDetachedWork,
    // Sibling concern: a periodic loop. `defineTimer` is the one way to declare
    // one in server/central code; a raw interval is banned outright.
    "no-raw-set-interval": noRawSetInterval,
  },
  ignores: {
    // Every path here is a `setInterval` that `defineTimer` cannot host. The
    // list is the exception register — add a line only with its reason.
    "no-raw-set-interval": [
      // THE sanctioned implementation: `defineTimer` itself.
      "plugins/infra/plugins/background/plugins/timer/shared/timer.ts",
      // Bun Worker thread (the sentinel's sampler / duress latch). A worker has
      // no plugin runtime, no registry and no profiler; it must keep sampling
      // while the main loop is wedged — the thing it exists to detect.
      "plugins/debug/plugins/sentinel/server/internal/worker/entry.ts",
      // Spawned child process measuring its own footprint: importing the plugin
      // runtime would pull the plugin graph into the heap it measures.
      "plugins/debug/plugins/paging-probe/server/internal/probe/entry.ts",
      // Process entry points' orphan guards: they run before (and outside) the
      // plugin graph that registers timers, and exit the process when its
      // parent dies.
      "plugins/framework/plugins/server-core/bin/index.ts",
      "plugins/framework/plugins/central-core/bin/index.ts",
      // The file-watcher engine's per-INSTANCE reconcile timer: every watcher
      // instance with a declared `reconcileMs` gets one, torn down with it. The
      // `defineFileWatcher` declaration is the unit the catalog lists (under
      // File watchers), and each tick is recorded there as one of its runs; a
      // timer entry per instance would list N copies of one mechanism.
      "plugins/infra/plugins/file-watcher/shared/engine.ts",
      // A synthetic test harness started by hand from a debug pane, at a rate
      // the person picks (up to 100/s) and stopped after at most a few minutes:
      // not background activity, and its cadence is chosen at runtime.
      "plugins/debug/plugins/live-state-churn/plugins/emit/server/internal/emitter.ts",
    ],
  },
};
