import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { Check, CheckContext, CheckResult, CheckScope } from "@plugins/framework/plugins/tooling/core";
import type { Grant } from "@plugins/infra/plugins/host-admission/core";
import { computeTreeHash } from "./tree-hash";
import { openCheckCache } from "./cache";
import { withScanView } from "./scan-context";
import { loadTreeSnapshot, validate, type TreeSnapshot, type QueryFact, type ValidateResult } from "./read-set";
import { gitGrepList } from "./grep-code";
import { openProgressRun } from "./progress-log";

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
 * Enforce the `Check.scope` invariant at LOAD, not at run: a `deploy` check's
 * subject is outside the tree hash, so without a `cacheSignature()` the runner
 * would record its verdict under a tree-only key and replay that pass for every
 * later deploy state — a green that can never go red again. Throwing here fires
 * for `runChecks` and `--list` alike, so the violation surfaces the moment the
 * check is written rather than as an inexplicably-passing check months later.
 */
function assertScopeInvariant(checks: Check[]): void {
  for (const check of checks) {
    if (scopeOf(check) === "deploy" && check.cacheSignature === undefined) {
      throw new Error(
        `Check "${check.id}" is scope: "deploy" but supplies no cacheSignature(). ` +
          `A deploy-scoped verdict is not covered by the working-tree hash, so caching it ` +
          `under the tree hash alone would record a permanently stale pass. Add a ` +
          `cacheSignature() that covers the deploy state it inspects (or returns null to ` +
          `opt out of caching entirely).`,
      );
    }
  }
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
   * Restrict the run to checks of this scope; omitted = every scope. See
   * `Check.scope`: `push` passes "tree" because a deploy-scoped verdict is about
   * an artifact outside the push payload. Selection is by PROPERTY — a caller
   * never enumerates ids to include or exclude.
   */
  scope?: CheckScope;
  /**
   * Absolute path to write the FULL, untruncated results to. The console
   * (`log`) output stays summarized/truncated so it doesn't flood an agent's
   * context (and survives being piped through `tail`); the file holds the
   * complete failure messages so they can be read directly. When set, the
   * console truncation note points at this file instead of telling the caller
   * to re-run.
   */
  logFile?: string;
}

export async function runChecks(ids: string[] | undefined, options: RunChecksOptions): Promise<boolean> {
  // Durable, per-run progress records (~/.singularity/check-progress.jsonl).
  // These exist because a single hung check makes the whole run report NOTHING:
  // the print loop far below only reaches the console after `Promise.all` fully
  // resolves. Written as each unit of work starts and settles — never from that
  // loop, which is precisely what a hang prevents from ever running.
  //
  // FIRST STATEMENT IN THE FUNCTION, deliberately. Everything after this line —
  // loading the check modules, `git rev-parse`, the tree hash, the cache, the
  // tree snapshot — can be slow or hang, and a hang before the run announces
  // itself is a hang we learn nothing about. Only the caller's own request is
  // knowable here; `treeHash` and the resolved selection arrive via
  // `progress.resolved()` once bootstrap has earned them.
  const progress = openProgressRun({
    scope: options.scope ?? null,
    requested: ids && ids.length > 0 ? ids : null,
  });

  const all = await progress.bootstrap("load-checks", () => listAllChecks());

  const named = ids && ids.length > 0
    ? all.filter((c) => ids.includes(c.id))
    : all;

  if (ids && named.length !== ids.length) {
    const known = new Set(all.map((c) => c.id));
    const unknown = ids.filter((id) => !known.has(id));
    console.error(`Unknown check(s): ${unknown.join(", ")}`);
    // Close the run: an early return is a finished run, and a run left open
    // would sit in `--status` forever as a phantom hang.
    progress.finish(false);
    return false;
  }

  // Scope filter runs AFTER id resolution so an unknown id still reports as
  // unknown rather than as out-of-scope. An id the caller named EXPLICITLY but
  // this scope excludes is a caller error, not a selection to quietly narrow:
  // dropping it would run a smaller set than asked and report a pass — and with
  // a single named id, an empty selection reaches `Promise.all([])` and passes
  // vacuously. Fail loudly instead.
  const scope = options.scope;
  const selected = scope === undefined ? named : named.filter((c) => scopeOf(c) === scope);
  if (scope !== undefined && ids && ids.length > 0) {
    const excluded = named.filter((c) => scopeOf(c) !== scope);
    if (excluded.length > 0) {
      console.error(
        `Excluded by --scope ${scope}: ${excluded
          .map((c) => `${c.id} is ${scopeOf(c)}-scoped`)
          .join(", ")}. Drop the --scope flag, or run only checks of that scope.`,
      );
      progress.finish(false);
      return false;
    }
  }

  const noCache = options?.noCache || process.env.SINGULARITY_CHECK_NO_CACHE === "1";
  // Root is only needed when caching (tree hash + snapshot); skipping it in
  // no-cache mode preserves today's behaviour of not touching git at all.
  // Each of the four is wrapped in its own progress phase. They all spawn git
  // or walk the cache dir, so any one of them can be where a run wedges — and
  // the diagnostic has to name WHICH, exactly as it names a hung check. Wrapping
  // costs one appended line per phase.
  const root = noCache ? null : await progress.bootstrap("root", () => getWorktreeRoot());
  const treeHash = root ? await progress.bootstrap("tree-hash", () => computeTreeHash(root)) : null;
  const cache = treeHash ? await progress.bootstrap("open-cache", () => openCheckCache()) : null;
  // The shared, content-addressed tree snapshot — loaded ONCE per run (one
  // `git ls-tree -r`) and reused by every input-keyed check's validate/record.
  // Loaded ONLY when some selected check is actually input-keyed, so the extra
  // spawn is never paid while the feature is unused. Fail-open: null → those
  // checks fall back to running under a null view (still keyed via the legacy
  // `has()/record()` path). STAGE 0: no check is input-keyed, so this is null.
  const anyInputKeyed = selected.some((c) => c.inputKeyed === true);
  const snapshot: TreeSnapshot | null =
    anyInputKeyed && root && treeHash
      ? await progress.bootstrap("tree-snapshot", () => loadTreeSnapshot(root, treeHash))
      : null;

  // Bootstrap is over: the facts that cost work to learn are now known, so they
  // reach the log as a follow-up record under the same `runId`.
  progress.resolved(treeHash, selected.map((c) => c.id));

  // Shadow-mode scaffold (dormant): when enabled, an input-keyed check logs the
  // old-vs-new decision so a divergence (old MISS/new HIT, or the validate
  // reason) is visible before a check is trusted. Never changes the verdict or
  // the default output. No check is input-keyed in Stage 0, so this never fires.
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
  const runOne = async (check: Check, wallStart: number): Promise<CheckOutcome> => {
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
    // `inputKeyed` flag — the runner never names check ids. Dormant in Stage 0
    // (no check sets the flag). A boolean `true` uses record-then-replay; the
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
              gitGrepList(snapshot.root, q.grepArg, q.fixed, q.pathspecs, snapshot.treeHash),
          });
        // eslint-disable-next-line promise-safety/no-bare-catch -- fail-open contract: any validation error (grep replay spawn failure, malformed snapshot) degrades to a cache MISS (the body runs and re-verifies), which can never produce a false HIT; propagating would abort the whole check run
        } catch (err) {
          verdict = { hit: false, reason: `validate threw (fail-open → run): ${String(err)}` };
        }
        if (verdict.hit) {
          if (shadow) observations.push({ line: `shadow: ${check.id} input-keyed HIT`, stream: "stdout" });
          return { check, result: { ok: true } as CheckResult, durationMs: Math.round(performance.now() - wallStart), wallStart, cached: true, observations };
        }
        if (shadow) observations.push({ line: `shadow: ${check.id} input-keyed MISS — ${verdict.reason}`, stream: "stdout" });
      }
      // MISS → run under a fresh recording view, capturing the read-set.
      const view = snapshot.createRecordingView();
      const result = await withScanView(treeHash, view, () => check.run(ctx));
      const durationMs = Math.round(performance.now() - wallStart);
      if (result.ok) cache.recordReadSet(check.id, sig, view.readSet());
      return { check, result, durationMs, wallStart, cached: false, observations };
    }

    // LEGACY whole-tree path (unchanged). Narrow inline (not via a stored
    // boolean) so TS sees cache/treeHash/sig as non-null in the guarded branch.
    if (cache !== null && treeHash !== null && sig !== null && cache.has(check.id, treeHash, sig)) {
      // A cache hit runs nothing, so it observes nothing.
      return { check, result: { ok: true } as CheckResult, durationMs: Math.round(performance.now() - wallStart), wallStart, cached: true, observations };
    }
    const result = await withScanView(treeHash, null, () => check.run(ctx));
    const durationMs = Math.round(performance.now() - wallStart);
    // Cache PASSES only — failures must always re-run with full output.
    if (cache !== null && treeHash !== null && sig !== null && result.ok) {
      cache.record(check.id, treeHash, sig);
    }
    return { check, result, durationMs, wallStart, cached: false, observations };
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
        }
      }),
    );
  } catch (err) {
    // The run is over either way: stop the heartbeat so it can never outlive the
    // run, and close the record. Rethrown untouched — this changes no semantics.
    progress.finish(false);
    throw err;
  }

  const log = options.log;
  const logFile = options.logFile;

  // Full, untruncated transcript mirrored to `logFile`. Every line emitted to
  // the console is also recorded here verbatim; failure messages are recorded
  // in full even when the console copy is truncated.
  const full: string[] = [];
  const emit = (line: string, stream: "stdout" | "stderr") => {
    log(line, stream);
    full.push(line);
  };

  const MAX_MESSAGE_LINES = 100;

  // Render a non-passing result's (possibly huge) message + optional hint: a
  // truncated copy to the console, the full copy to the transcript file. Shared
  // by the fatal-FAIL and the non-fatal inconclusive branches so the two can't
  // drift in truncation behaviour.
  const emitDetail = (check: Check, result: { message: string; hint?: string }) => {
    const indented = `  ${result.message.split("\n").join("\n  ")}`;
    const lines = result.message.split("\n");
    if (lines.length > MAX_MESSAGE_LINES) {
      const head = lines.slice(0, 50).join("\n");
      const tail = lines.slice(-50).join("\n");
      const omitted = lines.length - 100;
      const moreHint = logFile
        ? `see ${logFile} for full output`
        : `re-run \`./singularity check ${check.id}\` for full output`;
      // Truncated copy to the console; full copy to the file.
      log(`  ${head}\n  ... (${omitted} lines omitted — ${moreHint})\n  ${tail}`, "stderr");
      full.push(indented);
    } else {
      emit(`  ${result.message}`, "stderr");
    }
    if (result.hint) emit(`  hint: ${result.hint}`, "stderr");
  };

  // Flush a check's `ctx.log` observations through the SAME `emit()` the runner
  // uses for its own lines — console + full transcript (`logFile`, and the
  // build's checks section) — indented under the check's result line, exactly
  // like `emitDetail`. Purely informational: the verdict is already decided.
  const emitObservations = (observations: { line: string; stream: "stdout" | "stderr" }[]) => {
    for (const { line, stream } of observations) {
      emit(`  ${line.split("\n").join("\n  ")}`, stream);
    }
  };

  let allOk = true;
  let anyInconclusive = false;
  for (const { check, result, durationMs, wallStart, cached, observations } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      emit(`• ${check.id} ... ok${cached ? " (cached)" : ""}`, "stdout");
      emitObservations(observations);
    } else if (result.inconclusive) {
      // Environmental, non-fatal outcome: NOT a pass and NOT a hard failure.
      // It stays `ok: false`, so the caching guard above never recorded it —
      // it re-runs next build and re-verifies the real invariant. We only
      // soften fatality here (allOk untouched).
      anyInconclusive = true;
      emit(`⚠ ${check.id} ... inconclusive — ${result.message.split("\n")[0]}`, "stdout");
      emitObservations(observations);
      emitDetail(check, result);
    } else {
      allOk = false;
      emit(`• ${check.id} ... FAIL`, "stdout");
      emitObservations(observations);
      emitDetail(check, result);
    }
  }
  if (!allOk) {
    emit(
      "\nIf you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
        "Do NOT work around check failures — not by disabling checks, editing check code, " +
        "expanding skip lists, committing via raw git, or any other means.",
      "stderr",
    );
  } else if (anyInconclusive) {
    // Distinct from the STOP banner above (which correctly does NOT fire for an
    // inconclusive-only run): non-fatal, so it goes to stdout, not stderr.
    emit(
      "\nNote: some check(s) were inconclusive for environmental reasons (host-load timeout, " +
        "unlaunchable browser). They are non-fatal and NOT cached — they re-run and re-verify next build.",
      "stdout",
    );
  }

  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, full.join("\n") + "\n");
  }

  // Stops the heartbeat and closes the run's records. A run that reaches here
  // has, by definition, not hung — `started − ended` is empty.
  progress.finish(allOk);

  return allOk;
}
