import noAdhocFileSink from "./no-adhoc-file-sink";
import noAdhocProfilerSeam from "./no-adhoc-profiler-seam";

export default {
  name: "sink-safety",
  rules: {
    "no-adhoc-file-sink": noAdhocFileSink,
    "no-adhoc-profiler-seam": noAdhocProfilerSeam,
  },
  /**
   * Globs where a rule is not enforced, keyed by rule id. The root eslint.config
   * reads this generically and flips the rule off for these paths — it never
   * names this rule or these files itself.
   *
   * Both rules exempt TEST files: the invariant is about durable PRODUCTION
   * sinks, and a `*.test.ts` is neither durable nor production. A test
   * legitimately imports `appendFile` to mutate a fixture, or `readGateGauges` /
   * `onSlowSpan` to assert profiler behavior — a durable sink's real
   * implementation always lives in production code, which the rules still guard,
   * so exempting tests opens no hole. (Mirrors `marker-scan-safety`, which
   * allowlists the unit tests that exercise its banned idiom.)
   *
   * `no-adhoc-file-sink` also exempts two production sites (the file-sink
   * chokepoint is handled in-rule, not here). Both share the property that
   * routing through `defineFileSink` is structurally impossible:
   *   - the reports crash buffer appends inside an `uncaughtException` handler on
   *     a dying event loop, with drain-then-unlink queue semantics no channel
   *     offers — it cannot route through a declared sink.
   *   - the paging-probe entry is spawned as its own child process under a
   *     LOAD-BEARING lean-closure constraint (imports only runtime builtins + one
   *     zero-import file): importing `defineFileSink` would pull the whole plugin
   *     graph into the probe's heap and destroy the very phys_footprint
   *     measurement it exists to take. Its output is bounded the other way — the
   *     probe is config-gated OFF by default and run only for controlled
   *     investigations, not a durable always-on log.
   *
   * `no-adhoc-profiler-seam` needs no production allowlist: its owners are matched
   * in-rule by filename, and the profiler's own internals import the seams by
   * relative path (never the `@plugins/...` source the rule keys on).
   */
  ignores: {
    "no-adhoc-file-sink": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/plugins/reports/server/internal/buffer.ts",
      "**/plugins/debug/plugins/paging-probe/server/internal/probe/entry.ts",
    ],
    "no-adhoc-profiler-seam": ["**/*.test.ts", "**/*.test.tsx"],
  },
};
