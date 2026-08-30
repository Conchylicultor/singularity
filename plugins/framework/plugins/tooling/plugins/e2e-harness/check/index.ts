/**
 * Checks contributed by the e2e-harness plugin.
 *
 * Both are about the same thing from opposite directions: an e2e script must go
 * through the harness, and the harness must resolve the tool the lockfile chose.
 * A script that opts out of either still goes green, which is what makes them
 * checks rather than conventions.
 */
import pinnedPlaywrightInvocation from "./pinned-playwright-invocation";
import browserThroughHarness from "./browser-through-harness";

export default [pinnedPlaywrightInvocation, browserThroughHarness];
