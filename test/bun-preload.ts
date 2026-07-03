import { basename } from "node:path";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";

// `bun test` preload (registered in the root bunfig.toml `[test]` section).
//
// Worktree-scoped server code — the `db` pool, the per-worktree log dir, config_v2,
// reports — resolves its worktree identity from `SINGULARITY_WORKTREE`. In a real
// backend the gateway always sets it; a bare `bun test` does not, so any suite that
// transitively touches that code used to crash with a confusing
// "SINGULARITY_WORKTREE ... is required" the moment it ran (or, before the lazy-pool
// fix, at import). That forced every server-side / DB-backed suite to be invoked as
// `SINGULARITY_WORKTREE=<worktree> bun test …`, a footgun that scales with the
// growing set of server/DB-backed suites.
//
// The default belongs HERE, not in each throw site: those throws must stay loud in
// production (a backend with no worktree identity is a real bug), but a test run's
// sensible identity is simply the checkout it runs from. The worktree name is the
// basename of the checkout root by construction — the gateway derives
// `SINGULARITY_WORKTREE` from the worktree dir name, and the main checkout is
// "singularity" — so `basename(REPO_ROOT)` reproduces exactly what the hand-written
// `SINGULARITY_WORKTREE=<worktree> bun test` used to supply. Suites that never touch
// worktree-scoped code are unaffected either way.
//
// An explicitly-set value always wins (CI, or targeting main's DB with
// `SINGULARITY_WORKTREE=singularity bun test`); we only fill the gap when unset.
if (!process.env.SINGULARITY_WORKTREE) {
  process.env.SINGULARITY_WORKTREE = basename(REPO_ROOT);
}
