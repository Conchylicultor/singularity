import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import type { Check, CheckContext, CheckResult, CheckScope } from "@plugins/framework/plugins/tooling/core";
import type { Grant } from "@plugins/infra/plugins/host-admission/core";
import { computeTreeHash } from "./tree-hash";
import { openCheckCache } from "./cache";
import { withScanTree } from "./scan-context";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

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
  const all = await listAllChecks();

  const named = ids && ids.length > 0
    ? all.filter((c) => ids.includes(c.id))
    : all;

  if (ids && named.length !== ids.length) {
    const known = new Set(all.map((c) => c.id));
    const unknown = ids.filter((id) => !known.has(id));
    console.error(`Unknown check(s): ${unknown.join(", ")}`);
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
      return false;
    }
  }

  const noCache = options?.noCache || process.env.SINGULARITY_CHECK_NO_CACHE === "1";
  const treeHash = noCache ? null : await computeTreeHash(await getRoot());
  const cache = treeHash ? openCheckCache() : null;

  const results = await Promise.all(
    selected.map(async (check) => {
      const wallStart = performance.now();

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
      // Narrow inline (not via a stored boolean) so TS sees cache/treeHash/sig
      // as non-null in the guarded branches.
      if (cache !== null && treeHash !== null && sig !== null && cache.has(check.id, treeHash, sig)) {
        const result: CheckResult = { ok: true };
        // A cache hit runs nothing, so it observes nothing.
        const observations: { line: string; stream: "stdout" | "stderr" }[] = [];
        return { check, result, durationMs: Math.round(performance.now() - wallStart), wallStart, cached: true, observations };
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
      const result = await withScanTree(treeHash, () => check.run(ctx));
      const durationMs = Math.round(performance.now() - wallStart);
      // Cache PASSES only — failures must always re-run with full output.
      if (cache !== null && treeHash !== null && sig !== null && result.ok) {
        cache.record(check.id, treeHash, sig);
      }
      return { check, result, durationMs, wallStart, cached: false, observations };
    }),
  );

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

  return allOk;
}
