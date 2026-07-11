import type { Grant } from "@plugins/infra/plugins/host-admission/core";

/**
 * What every check is handed when run. `grant` is the host CPU admission the
 * invoking build/check/push already holds — a check that fans out heavy children
 * (type-check's per-target workers, layout-geometry's Chromium suite) spends
 * `grant.run(...)` per child instead of acquiring host-wide again, so the whole
 * check pass is accountable to the one grant. Checks that spawn nothing heavy
 * ignore the argument.
 */
export interface CheckContext {
  grant: Grant;
}

export interface Check {
  id: string;
  description: string;
  run(ctx: CheckContext): Promise<CheckResult>;
  /**
   * Run even when `./singularity build --skip-checks` is passed (and, as always,
   * during a normal build and `push`). For cheap, structural, codegen-coupled
   * invariants whose violation is painful to discover only at push — e.g. a
   * newly-reorderable slot that still owes an authored override. Default false:
   * the check only runs in the full check pass.
   */
  alwaysRun?: boolean;
  /**
   * Cache-signature contribution. Combined with the working-tree content hash
   * to key a recorded PASS, so an unchanged tree can reuse a prior green run
   * (e.g. `push` reusing `build`'s checks):
   *   - absent  → cacheable, keyed on the tree hash alone (default for checks
   *               that are pure deterministic functions of tree content).
   *   - string  → cacheable; the string is folded into the key (use this when
   *               the result depends on a runtime parameter — e.g. eslint's
   *               scope env — so distinct parameterizations get distinct keys).
   *   - null    → NEVER cache (impure: reads DB/network/env/git history).
   * Must be cheap and side-effect-free.
   */
  cacheSignature?(): string | null;
}

export type CheckResult =
  | { ok: true }
  /**
   * A non-passing result. `inconclusive: true` means the check could NOT
   * determine pass/fail for an *environmental* reason (a host-load timeout, an
   * unlaunchable browser, etc.) rather than a real regression. It is treated as
   * NON-FATAL by the runner (does not block the build) and is NEVER cached (it
   * stays `ok: false`, and the runner records only `ok === true`), so the check
   * re-runs next time and re-verifies the real invariant. Omit the flag for an
   * ordinary hard failure, which stays fatal exactly as before.
   */
  | { ok: false; message: string; hint?: string; inconclusive?: true };
