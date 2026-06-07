export interface Check {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
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
