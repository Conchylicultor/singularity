/**
 * Checks contributed by the e2e-harness plugin.
 *
 * All three guard the same property from different sides: a script that opts out
 * of the harness still finishes green, so the run itself never tells you it
 * happened. `pinned-playwright-invocation` keeps the harness on the browser the
 * lockfile chose, `browser-through-harness` keeps a script from launching one
 * behind the harness's back, and `target-not-env-derived` keeps a script from
 * learning which deploy it drives from an inherited environment variable. Each
 * would be a convention if any of them failed loudly on its own; none does.
 */
import pinnedPlaywrightInvocation from "./pinned-playwright-invocation";
import browserThroughHarness from "./browser-through-harness";
import targetNotEnvDerived from "./target-not-env-derived";

export default [
  pinnedPlaywrightInvocation,
  browserThroughHarness,
  targetNotEnvDerived,
];
