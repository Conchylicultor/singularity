import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type {
  Check,
  CheckContext,
  CheckResult,
  CheckScope,
} from "@plugins/framework/plugins/tooling/core";
import type { Grant } from "@plugins/infra/plugins/host/plugins/host-admission/core";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import { computeTreeHash } from "./tree-hash";
import { openCheckCache } from "./cache";
import { withScanView } from "./scan-context";
import {
  loadTreeSnapshot,
  validate,
  type TreeSnapshot,
  type QueryFact,
  type ValidateResult,
} from "./read-set";
import { gitGrepList } from "./grep-code";
import { openProgressRun } from "./progress-log";
import { openCheckTranscript } from "./transcript";
import { isBuildProcess } from "./run-context";

function isCheck(value: unknown): value is Check {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Check).id === "string" &&
    typeof (value as Check).description === "string" &&
    typeof (value as Check).run === "function"
  );
}

/**
 * A check's scope, with the default applied. THE one place `?? "tree"` is
 * written — every consumer (the scope filter below, `--list`) reads it through
 * here, so an unclassified check can never mean two different things in two
 * places.
 */
export function scopeOf(check: Check): CheckScope {
  return check.scope ?? "tree";
}

/**
 * Enforce the `Check.scope` invariant at LOAD, not at run: a non-tree check's
 * subject is outside the tree hash, so without a `cacheSignature()` the runner
 * would record its verdict under a tree-only key and replay that pass for every
 * later state of that subject — a green that can never go red again. Throwing
 * here fires for `runChecks` and `--list` alike, so the violation surfaces the
 * moment the check is written rather than as an inexplicably-passing check
 * months later.
 *
 * Written as "anything but `tree`" rather than as a list of the scopes that owe
 * a signature. The condition used to be `=== "deploy"`, which was the same set
 * while `deploy` was the only non-tree scope — and would have silently exempted
 * `host` the moment it was added, which is exactly the class of hole this
 * assertion exists to close.
 */
function assertScopeInvariant(checks: Check[]): void {
  for (const check of checks) {
    const scope = scopeOf(check);
    // `alwaysRun` means "run even under `build --skip-checks`" — it is defined
    // entirely in terms of the ops (build, push) that a `host` verdict is not
    // theirs to assert. The pair is a contradiction, so it has no spelling
    // rather than being quietly filtered out at each call site.
    if (scope === "host" && check.alwaysRun === true) {
      throw new Error(
        `Check "${check.id}" is scope: "host" and alwaysRun: true, which cannot both hold. ` +
          `alwaysRun means "run during a build even with --skip-checks", and a build cannot ` +
          `assert a host-scoped verdict: its subject is the machine, shared with every other ` +
          `checkout on this box and ahead of any one branch. Drop alwaysRun, or reclassify ` +
          `the check if its subject really is this tree or this build's deploy.`,
      );
    }
    if (scope !== "tree" && check.cacheSignature === undefined) {
      throw new Error(
        `Check "${check.id}" is scope: "${scope}" but supplies no cacheSignature(). ` +
          `A ${scope}-scoped verdict is not covered by the working-tree hash, so caching it ` +
          `under the tree hash alone would record a permanently stale pass. Add a ` +
          `cacheSignature() that covers the ${scope} state it inspects (or returns null to ` +
          `opt out of caching entirely).`,
      );
    }
  }
}

/**
 * The requested scopes as a set, or `null` for "every scope". ONE normalisation,
 * shared by the filter and by the string the progress run / transcript record —
 * so what a run reports it selected cannot drift from what it actually ran.
 */
function normalizeScopes(
  scope: CheckScope | readonly CheckScope[] | undefined,
): readonly CheckScope[] | null {
  if (scope === undefined) return null;
  return typeof scope === "string" ? [scope] : scope;
}

async function loadAllChecks(): Promise<Check[]> {
  const { checkEntries } = await import("./check.generated");
  const checks = await loadCollectedDir<Check>(checkEntries, {
    isItem: isCheck,
    dedupeKey: (c) => c.id,
    label: "check",
  });
  assertScopeInvariant(checks);
  return checks;
}

export async function listAllChecks(): Promise<Check[]> {
  return loadAllChecks();
}

export interface RunChecksOptions {
  /**
   * The host CPU grant the invoking build/check/push already holds, passed to
   * every `check.run(ctx)`. REQUIRED because the runner lives in the `core`
   * runtime and so cannot itself import the server-side `withHostGrant` to
   * acquire one — the caller (which sits at the CLI/server boundary) owns the
   * acquire and threads the grant in. `type-check` / `layout-geometry` spend it
   * per heavy child; every other check ignores it.
   */
  grant: Grant;
  onCheckDone?: (id: string, durationMs: number, wallStartMs: number) => void;
  log: (line: string, stream: "stdout" | "stderr") => void;
  /** Bypass the tree-hash result cache entirely (lookup + record). */
  noCache?: boolean;
  /**
   * Restrict the run to checks of these scopes; omitted = every scope. See
   * `Check.scope`: `push` passes "tree" because a deploy-scoped verdict is about
   * an artifact outside the push payload, and `build` passes ["tree","deploy"]
   * because it produces the dist the second kind inspects but does not own the
   * host state the third kind is about. Selection is by PROPERTY — a caller
   * never enumerates ids to include or exclude.
   *
   * A SET, not one value, because "the scopes I can assert" is genuinely plural
   * for a caller sitting between the extremes: `build` asserts two of the three.
   * Spelled as a lone `CheckScope` it could only say so by dropping the filter
   * entirely, which is not the same claim — it silently picks up every scope
   * added later, which is exactly how a build came to assert the host's state.
   */
  scope?: CheckScope | readonly CheckScope[];
  /**
   * Restrict the run to checks flagged `Check.alwaysRun`; omitted = no such
   * restriction. This is the `--skip-checks` validation set, selected BY
   * PROPERTY exactly like `scope` — a caller never enumerates the ids, because
   * a list computed in the caller's process is a registry read performed
   * wherever that process happens to be, not in the process that runs them.
   * Composes with `scope` as an AND.
   */
  alwaysRun?: boolean;
  /**
   * The run this transcript belongs to — the worktree whose data dir it sits in,
   * and the id the caller ALREADY owns (a build's `buildId`, a standalone
   * check's `opId`). Omitted, no transcript is written.
   *
   * The runner derives the path itself (`worktreeArtifacts.checkLog`) AND uses
   * `runId` as the progress-log run id, so the filename and this run's lines in
   * `check-progress.jsonl` can never name different runs. That is the whole
   * reason this is not a path: a caller handing in `check-<x>.log` while the
   * progress log minted its own uuid is precisely the drift that made a
   * transcript unattributable.
   *
   * The file holds the complete failure messages; the console (`log`) copy stays
   * summarized/truncated so it doesn't flood an agent's context (and survives
   * being piped through `tail`). When set, the console truncation note points at
   * this file instead of telling the caller to re-run.
   */
  logRun?: { worktree: Namespace; runId: string };
}

export async function runChecks(
  ids: string[] | undefined,
  options: RunChecksOptions,
): Promise<boolean> {
  // FIRST STATEMENT, ahead of even the progress run: a refused call must not
  // leave a phantom open run behind for `--status` to report as a hang.
  //
  // A passing check writes a durable entry to the GLOBAL cache, keyed on the
  // tree hash and carrying no provenance — so a later `push` in a clean process
  // reads back a verdict this process recorded. That makes a recorded PASS a
  // TRANSFERABLE claim, and it is only true if the process that produced it did
  // nothing but run checks. A build's process has already imported every plugin
  // barrel and run the slot-declaration pass, so a check reading either sees a
  // world no standalone check can reproduce. That is not hypothetical: commit
  // `fa7e865e0` shipped a `docs/plugins-details.md` only a build could
  // reproduce, four pushes hit the cached pass, and the failure surfaced hours
  // later on an unrelated branch (fixed at the source in `18126884a`).
  //
  // Deliberately not folded into `assertScopeInvariant`: that validates the
  // loaded check COLLECTION at load time; this validates the PROCESS at call
  // time. Different subject, different lifetime.
  if (isBuildProcess()) {
    throw new Error(
      "runChecks() was called from the build process itself. A check pass must run " +
        "in a process that did nothing but run checks: a passing check records a " +
        "durable entry in the global check cache that a later `push` reads back from " +
        "a clean process, so the verdict has to be transferable. A build's process " +
        "has already imported every plugin barrel and run the slot-declaration pass " +
        "— that contamination is how commit fa7e865e0 shipped a generated doc only a " +
        "build could reproduce (fixed at the source in 18126884a). Spawn the check " +
        "pass instead: `runCheckSubprocess(...)` from cli/plugins/op-runtime/cli/check-subprocess.ts.",
    );
  }

  // Durable, per-run progress records (~/.singularity/logs/check-progress/check-progress.jsonl).
  // These exist because a single hung check makes the whole run report NOTHING:
  // the print loop far below only reaches the console after `Promise.all` fully
  // resolves. Written as each unit of work starts and settles — never from that
  // loop, which is precisely what a hang prevents from ever running.
  //
  // FIRST WORK IN THE FUNCTION, deliberately — only the process guard above it,
  // which does no work and whose whole point is to refuse BEFORE a run exists.
  // Everything after this line — loading the check modules, `git rev-parse`, the
  // tree hash, the cache, the tree snapshot — can be slow or hang, and a hang
  // before the run announces itself is a hang we learn nothing about. Only the
  // caller's own request is
  // knowable here; `treeHash` and the resolved selection arrive via
  // `progress.resolved()` once bootstrap has earned them.
  const requested = ids && ids.length > 0 ? ids : null;
  const requestedScopes = normalizeScopes(options.scope)?.join(",") ?? null;
  const progress = openProgressRun({
    scope: requestedScopes,
    requested,
    runId: options.logRun?.runId,
  });

  // The transcript opens HERE, beside the progress run and for the same reason:
  // it must exist from the first moment, not once every check has settled. Its
  // header is on disk before the checks are even loaded, so a run killed
  // mid-checks leaves a partial transcript OF ITSELF rather than its
  // predecessor's complete one.
  const transcript = options.logRun
    ? openCheckTranscript({
        ...options.logRun,
        scope: requestedScopes,
        requested,
      })
    : null;

  const all = await progress.bootstrap("load-checks", () => listAllChecks());

  const named =
    ids && ids.length > 0 ? all.filter((c) => ids.includes(c.id)) : all;

  if (ids && named.length !== ids.length) {
    const known = new Set(all.map((c) => c.id));
    const unknown = ids.filter((id) => !known.has(id));
    const message = `Unknown check(s): ${unknown.join(", ")}`;
    console.error(message);
    // Close the run: an early return is a finished run, and a run left open
    // would sit in `--status` forever as a phantom hang. Same for the
    // transcript, which otherwise ends at its header with no reason given.
    transcript?.finish([message], false);
    progress.finish(false);
    return false;
  }

  // Scope filter runs AFTER id resolution so an unknown id still reports as
  // unknown rather than as out-of-scope. An id the caller named EXPLICITLY but
  // this scope excludes is a caller error, not a selection to quietly narrow:
  // dropping it would run a smaller set than asked and report a pass — and with
  // a single named id, an empty selection reaches `Promise.all([])` and passes
  // vacuously. Fail loudly instead.
  const scopes = normalizeScopes(options.scope);
  const scoped =
    scopes === null ? named : named.filter((c) => scopes.includes(scopeOf(c)));
  if (scopes !== null && ids && ids.length > 0) {
    const excluded = named.filter((c) => !scopes.includes(scopeOf(c)));
    if (excluded.length > 0) {
      const message = `Excluded by --scope ${scopes.join(",")}: ${excluded
        .map((c) => `${c.id} is ${scopeOf(c)}-scoped`)
        .join(", ")}. Drop the --scope flag, or run only checks of that scope.`;
      console.error(message);
      transcript?.finish([message], false);
      progress.finish(false);
      return false;
    }
  }

  // The `alwaysRun` filter composes with `--scope` as an AND, and reuses the
  // scope filter's exact shape for the same reason: an id the caller named
  // EXPLICITLY but this filter excludes is a caller error, not a selection to
  // quietly narrow.
  const alwaysRun = options.alwaysRun === true;
  const selected = alwaysRun
    ? scoped.filter((c) => c.alwaysRun === true)
    : scoped;
  if (alwaysRun && ids && ids.length > 0) {
    const excluded = scoped.filter((c) => c.alwaysRun !== true);
    if (excluded.length > 0) {
      const message = `Excluded by --always-run: ${excluded
        .map((c) => `${c.id} is not alwaysRun`)
        .join(
          ", ",
        )}. Drop the --always-run flag, or name only alwaysRun checks.`;
      console.error(message);
      transcript?.finish([message], false);
      progress.finish(false);
      return false;
    }
  }
  // An `alwaysRun` selection that comes out EMPTY is a vacuous pass:
  // `Promise.all([])` resolves to `[]` and this function returns true having
  // proven nothing. This is the only place that can notice — the caller
  // expresses the selection as a flag and never enumerates it, precisely so the
  // registry is read in the process that runs the checks. So if the last
  // `alwaysRun: true` is ever deleted, `build --skip-checks` fails loudly here
  // instead of silently proving less than it claims.
  if (alwaysRun && selected.length === 0) {
    const message =
      "No checks are flagged `alwaysRun`, so --always-run selected nothing. " +
      "A run that asserts nothing must not report a pass: either restore the " +
      "alwaysRun flag on the checks the fast path depends on, or drop the flag " +
      "and stop claiming this pass validates anything.";
    console.error(message);
    transcript?.finish([message], false);
    progress.finish(false);
    return false;
  }

  const noCache =
    options?.noCache || process.env.SINGULARITY_CHECK_NO_CACHE === "1";
  // Root is only needed when caching (tree hash + snapshot); skipping it in
  // no-cache mode preserves today's behaviour of not touching git at all.
  // Each of the four is wrapped in its own progress phase. They all spawn git
  // or walk the cache dir, so any one of them can be where a run wedges — and
  // the diagnostic has to name WHICH, exactly as it names a hung check. Wrapping
  // costs one appended line per phase.
  const root = noCache
    ? null
    : await progress.bootstrap("root", () => getWorktreeRoot());
  const treeHash = root
    ? await progress.bootstrap("tree-hash", () => computeTreeHash(root))
    : null;
  const cache = treeHash
    ? await progress.bootstrap("open-cache", () => openCheckCache())
    : null;
  // The shared, content-addressed tree snapshot — loaded ONCE per run (one
  // `git ls-tree -r`) and reused by every input-keyed check's validate/record.
  // Loaded ONLY when some selected check is actually input-keyed, so the extra
  // spawn is never paid while the feature is unused. Fail-open: null → those
  // checks fall back to running under a null view (still keyed via the legacy
  // `has()/record()` path). Nine checks are input-keyed today, `type-check` and
  // `plugin-boundaries` among them, so a full pass loads this snapshot — it is a
  // hot path, not a dormant one.
  const anyInputKeyed = selected.some((c) => c.inputKeyed === true);
  const snapshot: TreeSnapshot | null =
    anyInputKeyed && root && treeHash
      ? await progress.bootstrap("tree-snapshot", () =>
          loadTreeSnapshot(root, treeHash),
        )
      : null;

  // Bootstrap is over: the facts that cost work to learn are now known, so they
  // reach the log as a follow-up record under the same `runId`.
  progress.resolved(
    treeHash,
    selected.map((c) => c.id),
  );

  // Shadow mode (opt-in via the env var): an input-keyed check logs the
  // old-vs-new decision so a divergence (old MISS/new HIT, or the validate
  // reason) is visible before a check is trusted. Never changes the verdict or
  // the default output. Off unless asked for — the input-keyed path itself is
  // live on every run, so this is the one part that is genuinely opt-in.
  const shadow = process.env.SINGULARITY_CHECK_SHADOW === "1";

  interface CheckOutcome {
    check: Check;
    result: CheckResult;
    durationMs: number;
    wallStart: number;
    cached: boolean;
    observations: { line: string; stream: "stdout" | "stderr" }[];
  }

  // One check, start to settle. Extracted from the `Promise.all` callback ONLY
  // so the progress log can wrap it in a try/finally — a `finally` cannot see a
  // return value, and the callback has four return sites.
  const runOne = async (
    check: Check,
    wallStart: number,
  ): Promise<CheckOutcome> => {
    // A check opts out of caching by returning null from cacheSignature();
    // absent → "" (keyed on tree hash alone). The runner never names checks.
    let sig: string | null = "";
    if (check.cacheSignature) {
      try {
        sig = check.cacheSignature();
        // eslint-disable-next-line promise-safety/no-bare-catch -- cacheSignature() failure of any kind safely degrades to uncached; propagating would abort the check run, which is a worse outcome than skipping the cache
      } catch {
        sig = null;
      }
    }

    // Non-fatal observations (measurements, capacity notes) a check emits via
    // `ctx.log`. Buffered rather than written straight through: checks run
    // under Promise.all, so a live write would interleave lines from every
    // in-flight check. They are flushed through the runner's own `emit()`
    // below, attributed under the emitting check's result line — so the
    // transcript stays deterministic and diffable across runs.
    const observations: { line: string; stream: "stdout" | "stderr" }[] = [];

    // Scan the SAME tree the cache key (treeHash) is computed from, so a
    // recorded PASS always reflects content the check actually inspected. The
    // grant is the caller's held host CPU admission; heavy checks spend it.
    const ctx: CheckContext = {
      grant: options.grant,
      log: (line, stream) => observations.push({ line, stream }),
    };

    // INPUT-KEYED path (validate-by-replay). Selected GENERICALLY on the
    // `inputKeyed` flag — the runner never names check ids. Live: nine checks
    // set the flag today, so this branch runs on every check pass. A boolean
    // `true` uses record-then-replay; the
    // `"declared"` variant (opaque checks) is not wired yet and falls through
    // to the legacy path until its stage lands. Narrow inline (not via a stored
    // boolean) so TS sees cache/treeHash/sig as non-null in this branch.
    if (
      cache !== null &&
      treeHash !== null &&
      sig !== null &&
      snapshot !== null &&
      check.inputKeyed === true
    ) {
      const stored = cache.loadReadSet(check.id, sig);
      if (stored !== null) {
        // Replay a recorded `git grep -l` query against the CURRENT snapshot
        // tree — called by `validate` ONLY when a query's pathspec fingerprint
        // changed (the cheap in-memory gate runs first). Re-runs the SAME grep
        // plumbing `readCandidates` used (via the shared `gitGrepList`), over
        // the fresh tree, so a brand-new matching file is seen (H9).
        //
        // FAIL-OPEN: any error thrown by validate (a grep-replay spawn failure,
        // a malformed snapshot) degrades to a MISS (run the body), never a
        // crash and never a false HIT — the cache can only ever cause an
        // unnecessary re-run, not a stale PASS.
        let verdict: ValidateResult;
        try {
          verdict = await validate(stored, snapshot, {
            replayQuery: (q: QueryFact) =>
              gitGrepList(
                snapshot.root,
                q.grepArg,
                q.fixed,
                q.pathspecs,
                snapshot.treeHash,
              ),
          });
          // fail-open contract: any validation error (grep replay spawn failure, malformed snapshot) degrades to a cache MISS (the body runs and re-verifies), which can never produce a false HIT; propagating would abort the whole check run
        } catch (err) {
          verdict = {
            hit: false,
            reason: `validate threw (fail-open → run): ${String(err)}`,
          };
        }
        if (verdict.hit) {
          if (shadow)
            observations.push({
              line: `shadow: ${check.id} input-keyed HIT`,
              stream: "stdout",
            });
          return {
            check,
            result: { ok: true } as CheckResult,
            durationMs: Math.round(performance.now() - wallStart),
            wallStart,
            cached: true,
            observations,
          };
        }
        if (shadow)
          observations.push({
            line: `shadow: ${check.id} input-keyed MISS — ${verdict.reason}`,
            stream: "stdout",
          });
      }
      // MISS → run under a fresh recording view, capturing the read-set.
      const view = snapshot.createRecordingView();
      const result = await withScanView(treeHash, view, () => check.run(ctx));
      const durationMs = Math.round(performance.now() - wallStart);
      if (result.ok) cache.recordReadSet(check.id, sig, view.readSet());
      return {
        check,
        result,
        durationMs,
        wallStart,
        cached: false,
        observations,
      };
    }

    // LEGACY whole-tree path (unchanged). Narrow inline (not via a stored
    // boolean) so TS sees cache/treeHash/sig as non-null in the guarded branch.
    if (
      cache !== null &&
      treeHash !== null &&
      sig !== null &&
      cache.has(check.id, treeHash, sig)
    ) {
      // A cache hit runs nothing, so it observes nothing.
      return {
        check,
        result: { ok: true } as CheckResult,
        durationMs: Math.round(performance.now() - wallStart),
        wallStart,
        cached: true,
        observations,
      };
    }
    const result = await withScanView(treeHash, null, () => check.run(ctx));
    const durationMs = Math.round(performance.now() - wallStart);
    // Cache PASSES only — failures must always re-run with full output.
    if (cache !== null && treeHash !== null && sig !== null && result.ok) {
      cache.record(check.id, treeHash, sig);
    }
    return {
      check,
      result,
      durationMs,
      wallStart,
      cached: false,
      observations,
    };
  };

  let results: CheckOutcome[];
  try {
    results = await Promise.all(
      selected.map(async (check) => {
        const wallStart = performance.now();
        progress.checkStarted(check.id);
        let outcome: CheckOutcome | undefined;
        try {
          outcome = await runOne(check, wallStart);
          return outcome;
        } finally {
          // In a `finally` so a THROWING check still records its end — otherwise
          // a crash would masquerade as the hang we are hunting.
          progress.checkEnded(
            check.id,
            Math.round(performance.now() - wallStart),
            outcome?.result.ok ?? false,
            outcome?.cached ?? false,
          );
          // The transcript is written as each check SETTLES, not from the print
          // loop below — the loop runs after `Promise.all`, which a hung or
          // killed run reaches never. A check that threw has no outcome to
          // render; its `end` record above is what says so.
          if (outcome) {
            transcript?.record({
              checkId: check.id,
              result: outcome.result,
              cached: outcome.cached,
              observations: outcome.observations,
            });
          }
        }
      }),
    );
  } catch (err) {
    // The run is over either way: stop the heartbeat so it can never outlive the
    // run, and close the records. Rethrown untouched — this changes no semantics.
    transcript?.finish([`run aborted: ${String(err)}`], false);
    progress.finish(false);
    throw err;
  }

  // Everything below renders to the CONSOLE only. The durable copy is the
  // transcript, already written check by check as they settled — so this loop
  // is free to truncate, and losing it (a kill, a throw) costs no record.
  const log = options.log;

  const MAX_MESSAGE_LINES = 100;

  // Render a non-passing result's (possibly huge) message + optional hint,
  // truncated in the middle when it is enormous: truncation protects an agent's
  // context window, which is why it is a console concern and the transcript
  // keeps the full text. Shared by the fatal-FAIL and the non-fatal inconclusive
  // branches so the two can't drift in truncation behaviour.
  const emitDetail = (
    check: Check,
    result: { message: string; hint?: string },
  ) => {
    const lines = result.message.split("\n");
    if (lines.length > MAX_MESSAGE_LINES) {
      const head = lines.slice(0, 50).join("\n");
      const tail = lines.slice(-50).join("\n");
      const omitted = lines.length - 100;
      const moreHint = transcript
        ? `see ${transcript.path} for full output`
        : `re-run \`./singularity check ${check.id}\` for full output`;
      log(
        `  ${head}\n  ... (${omitted} lines omitted — ${moreHint})\n  ${tail}`,
        "stderr",
      );
    } else {
      log(`  ${result.message}`, "stderr");
    }
    if (result.hint) log(`  hint: ${result.hint}`, "stderr");
  };

  // Flush a check's `ctx.log` observations to the console, indented under the
  // check's result line exactly like `emitDetail` (and like the transcript's own
  // block). Purely informational: the verdict is already decided.
  const emitObservations = (
    observations: { line: string; stream: "stdout" | "stderr" }[],
  ) => {
    for (const { line, stream } of observations) {
      log(`  ${line.split("\n").join("\n  ")}`, stream);
    }
  };

  let allOk = true;
  let anyInconclusive = false;
  // Selection-ordered, deliberately unlike the transcript's completion order: a
  // terminal summary printed once is easier to read (and to diff across runs) in
  // the order the checks were named.
  for (const {
    check,
    result,
    durationMs,
    wallStart,
    cached,
    observations,
  } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      log(`• ${check.id} ... ok${cached ? " (cached)" : ""}`, "stdout");
      emitObservations(observations);
    } else if (result.inconclusive) {
      // Environmental, non-fatal outcome: NOT a pass and NOT a hard failure.
      // It stays `ok: false`, so the caching guard above never recorded it —
      // it re-runs next build and re-verifies the real invariant. We only
      // soften fatality here (allOk untouched).
      anyInconclusive = true;
      log(
        `⚠ ${check.id} ... inconclusive — ${result.message.split("\n")[0]}`,
        "stdout",
      );
      emitObservations(observations);
      emitDetail(check, result);
    } else {
      allOk = false;
      log(`• ${check.id} ... FAIL`, "stdout");
      emitObservations(observations);
      emitDetail(check, result);
    }
  }

  // The closing banner is the one thing the console and the transcript still
  // share verbatim: it is about the RUN, not about any one check, so neither the
  // settle loop nor the print loop can own it.
  const trailer: string[] = [];
  if (!allOk) {
    const stop =
      "\nIf you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
      "Do NOT work around check failures — not by disabling checks, editing check code, " +
      "expanding skip lists, committing via raw git, or any other means.";
    log(stop, "stderr");
    trailer.push(stop);
  } else if (anyInconclusive) {
    // Distinct from the STOP banner above (which correctly does NOT fire for an
    // inconclusive-only run): non-fatal, so it goes to stdout, not stderr.
    const note =
      "\nNote: some check(s) were inconclusive for environmental reasons (host-load timeout, " +
      "unlaunchable browser). They are non-fatal and NOT cached — they re-run and re-verify next build.";
    log(note, "stdout");
    trailer.push(note);
  }

  // Closes the transcript and prunes the family.
  transcript?.finish(trailer, allOk);

  // Stops the heartbeat and closes the run's records. A run that reaches here
  // has, by definition, not hung — `started − ended` is empty.
  progress.finish(allOk);

  return allOk;
}
