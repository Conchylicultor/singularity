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
  /**
   * Emit a NON-FATAL OBSERVATION from inside a check — a measurement, a capacity
   * note, anything a passing check needs to say. The line goes wherever the
   * runner's own lines go: the console AND the durable transcript (`check.log`,
   * and the build's checks section in `build.log`), so an observation is
   * greppable after the fact instead of scrolling past in a terminal.
   *
   * It exists because a check had NO output channel of its own: `CheckResult`
   * carries a `message` only on `ok: false`, so a passing check writing to
   * `process.stderr` reached the terminal and nowhere else. Measurements that
   * must survive the run (e.g. type-check's per-worker `maxRSS`, which calibrates
   * host-admission's RAM quantum) evaporated.
   *
   * NOT an error channel, and NOT an escape hatch for silencing a failure: a
   * check that has found a violation MUST return `{ ok: false, message }` (or
   * throw). Logging a problem here instead would make it non-fatal and invisible
   * to the verdict — the exact "fail loudly" violation the repo forbids.
   *
   * OPTIONAL: a check that observes nothing ignores it; a caller that runs a
   * check outside the runner may not supply one. Call it as `ctx.log?.(…)`.
   */
  log?: (line: string, stream: "stdout" | "stderr") => void;
}

/**
 * The scope axis, as values — so a caller that must validate one at runtime (the
 * CLI's `--scope` flag) reads the same closed set the type is derived from, and
 * a new scope can never be accepted by the type but rejected by the flag.
 */
export const CHECK_SCOPES = ["tree", "deploy"] as const;

/**
 * What a check's verdict is a function of — the axis that decides which callers
 * can meaningfully assert it. See `Check.scope`.
 */
export type CheckScope = (typeof CHECK_SCOPES)[number];

export interface Check {
  id: string;
  description: string;
  run(ctx: CheckContext): Promise<CheckResult>;
  /**
   * What the verdict is ABOUT, which decides who can assert it:
   *   - "tree" (default) → the verdict is a function of the working-tree content
   *     hash (`computeTreeHash`: tracked files + working changes, honoring
   *     .gitignore). Whatever that hash covers is exactly what a push carries,
   *     so the check is in the push payload and every caller can assert it.
   *   - "deploy" → the check verifies the local, gitignored deployment that
   *     `./singularity build` produces (`plugins/framework/plugins/web-core/dist`,
   *     the `~/.singularity/web-artifacts` store). That artifact NEVER lands on
   *     main, and `push`'s own internal rebase invalidates it by construction
   *     (the tree moves past the deployed dist), so push cannot meaningfully
   *     assert it — no matter how it is scheduled. Its real homes are `build`
   *     (which deploys, then verifies), a standalone `./singularity check`, and
   *     main's post-push auto-build.
   *
   * Consumers select BY THIS PROPERTY, NEVER by check id: `push` asks for
   * `--scope tree`, not for "everything except web-artifacts:map-in-sync".
   * Classifying a new check is then the only edit a new check needs.
   *
   * THE INVARIANT that makes this load-bearing: `scope: "deploy"` means the tree
   * hash does NOT cover the check's subject, so the check MUST supply a
   * `cacheSignature()` (covering the deploy state, or returning null). Without
   * one, a verdict about the deploy would be recorded under a tree-only cache
   * key — a pass that survives every later deploy change, i.e. a permanently
   * stale green. Enforced at load; a violation throws.
   */
  scope?: CheckScope;
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
  /**
   * Cache-invalidation strategy — how a recorded PASS is decided still valid on
   * the next run:
   *   - absent (default) → LEGACY whole-tree keying. The PASS is keyed on the
   *     entire working-tree hash (`computeTreeHash`), so ANY tree change re-runs
   *     the check. Unchanged, always-sound, and the behaviour of every check
   *     today.
   *   - `true` → INPUT-KEYED via validate-by-replay. The check runs against a
   *     recording `FileSystemView` (see `checks/core/read-set.ts`) that logs the
   *     exact tree facts its verdict depended on (file contents, existence,
   *     directory membership, glob/pathspec expansion, grep selection). On the
   *     next run those facts are replayed against the fresh snapshot; a PASS
   *     survives a tree change that cannot affect the verdict. A check may set
   *     this ONLY once its ENTIRE transitive read surface routes through the
   *     view — otherwise a read via an un-instrumented path is unrecorded and a
   *     stale PASS becomes possible. Any snapshot/view/validation doubt is
   *     treated as a MISS (run), so the cache can never CAUSE a stale PASS.
   *   - `"declared"` → INPUT-KEYED via an explicit `declaredInputs()` spec rather
   *     than record-then-replay, for OPAQUE checks whose reads happen inside a
   *     subprocess the view cannot observe (e.g. `migrations-in-sync` spawning
   *     `drizzle-kit`). Wired in a later stage.
   *
   * Consumers (the runner) read this GENERICALLY and never name check ids
   * (collection-consumer rule). STAGE 0: no check sets this — the input-keyed
   * path is fully built but dormant, so every check takes the legacy path and
   * behaviour is unchanged.
   */
  inputKeyed?: boolean | "declared";
  /**
   * For `inputKeyed: "declared"` checks only: the explicit input spec (globs +
   * files, incl. tool-version inputs like `bun.lock`) whose contents/membership
   * key the PASS, since a record-then-replay view cannot observe the check's
   * opaque subprocess reads. Optional and NOT yet consumed — reserved for the
   * declared-inputs stage.
   */
  declaredInputs?(): { globs?: string[]; files?: string[] };
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
