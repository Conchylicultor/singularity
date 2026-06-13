export interface Check {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
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
  | { ok: false; message: string; hint?: string };
