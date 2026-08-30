/**
 * The build ledger's own name for itself.
 *
 * It lives HERE, in the ledger that owns `build_runs`, rather than in the runs
 * arm that projects it — and that placement is load-bearing, not tidiness.
 *
 * The string is needed on both sides of an import edge that runs in opposite
 * directions: `build/web` needs it to name a selected row (`{ kind, id }`), and
 * the runs arm needs `build/web` for the run-detail pane it opens. With the
 * constant in the arm's own core those two edges close a cycle
 * (`build → build/runs-arm → build`), which `plugin-boundaries` rejects — the
 * checker collapses to plugin granularity, so "different runtimes" does not
 * save it.
 *
 * `run-ledger` is the right leaf to break it: it already owns the table, it
 * imports nothing from `build`, and a kind string is an identity, which is
 * exactly what a ledger has. Both sides import it from here and there is no
 * path back.
 *
 * Do NOT re-export it from `runs-arm/core` to save an import: cross-plugin
 * re-exports are banned (they hide the real dependency), and the ban is
 * enforced transitively.
 */
export const BUILD_RUN_KIND = "build";
