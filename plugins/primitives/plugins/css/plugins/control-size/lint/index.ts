import noAdhocControl from "./no-adhoc-control";
import noAdhocDensity from "./no-adhoc-density";

/**
 * Lint barrel for the `no-adhoc-control` + `no-adhoc-density` rules. The root
 * `eslint.config.ts` auto-discovers this default export and registers both
 * repo-wide as `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors
 * `badge/no-adhoc-chip`). Both rules are precise:
 *
 * - `no-adhoc-control` fires only on the genuine hand-rolled-control escape
 *   hatches (importing `buttonVariants`, or a raw `<button>`/`<a>` carrying the
 *   fixed-height + horizontal-padding + rounded fingerprint).
 * - `no-adhoc-density` fires only on a per-instance density override (a `size=`
 *   prop or a fixed `h-*`/`size-*`/`control-*` class) on the density-participating
 *   control primitives, which derive size from ambient control density.
 */
export default {
  name: "control-size",
  rules: {
    "no-adhoc-control": noAdhocControl,
    "no-adhoc-density": noAdhocDensity,
  },
  ignores: {
    "no-adhoc-control": [],
    "no-adhoc-density": [],
  },
};
