/**
 * `type-check` — the unified TypeScript + type-aware-ESLint check.
 *
 * The old `typescript` and `eslint` checks each built the full TS program over
 * the repo (tsc for diagnostics, typescript-eslint via projectService for the
 * type-aware rules). Type-aware linting is ~99% TS-program construction — the
 * same work tsc does — so the cold cost was paid twice. This check builds each
 * tsconfig target's program ONCE (in a per-target worker process) and reads
 * both tsc diagnostics and lint results off it.
 *
 * Warm paths are preserved: tsc stays incremental via the shared `.tsbuildinfo`,
 * and lint reuses the per-file closure cache (only closure-changed files are
 * re-linted). Files are assigned to exactly one program for linting (dedup)
 * but tsc still checks shared `core` files under every program that includes
 * them — exactly as the old typescript check did.
 */
import { writeFileSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { join, relative } from "path";
import ts from "typescript";
import {
  discoverTscTargets,
  tsBuildInfoPath,
  materializeWarmBase,
  publishWarmBase,
  currentScanView,
  type TscTarget,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import type {
  Check,
  CheckContext,
} from "@plugins/framework/plugins/tooling/core";
import { buildImportGraphs } from "./import-graph";
import { computeClosureFingerprints, readTreeListing } from "./fingerprint";
import { openClosureCache } from "./closure-cache";
import { recordOuterReadSet } from "./outer-read-set";
import {
  openProgramKeyContext,
  openProgramPasses,
  programKey,
} from "./program-key";

/** The worker's JSON stdout contract (see `../shared/worker.ts`). */
interface WorkerOutput {
  name: string;
  tscErrors: string;
  lintViolations: string;
  failedLintFiles: string[];
}

interface WorkerResult extends WorkerOutput {
  /**
   * Peak RSS of the worker PROCESS (bytes), measured by the parent after exit.
   * `undefined` when the runtime reported no rusage — an unavailable
   * measurement, not a failure: the footprint line is simply omitted.
   */
  maxRssBytes: number | undefined;
  /**
   * User + system CPU the worker burned, in microseconds. THE cost unit for
   * this fleet: wall clock on this host varies 2.5x with load for the identical
   * program build, so a before/after comparison taken in wall clock measures
   * whoever else was running. Same availability caveat as `maxRssBytes`.
   */
  cpuTimeMicros: number | undefined;
}

const WORKER = fileURLToPath(new URL("../shared/worker.ts", import.meta.url));

// Priority isolation at the spawn site: workers for a non-main branch run
// darwinbg (E-cores + background IO tier) so N concurrent agent fleets can't
// starve the interactive main backend — regardless of whether the parent
// session/CLI was itself demoted. Relying on inheritance is how 10 of 11
// workers ran undemoted on 2026-07-08 (see
// research/perfs/2026-07-08-host-saturation-agent-checks-starve-main.md).
// Main-branch runs stay undemoted — the user is waiting on them (same rule as
// build.ts's `branch === "main"` slot exemption). The demotion itself is
// spawnCaptured's `background` option (spawn-priority's backgroundArgv).
async function workerBackground(): Promise<boolean> {
  const result = await spawnCaptured(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    // Wedge-breaker for a metadata-only git read, far above any real duration.
    // The worker spawn below is the one that legitimately runs for minutes; this
    // one only decides whether to demote it.
    { timeoutMs: 60_000 },
  );
  return result.stdout.trim() !== "main";
}

const toRel = (root: string, abs: string): string =>
  relative(root, abs).split("\\").join("/");

/** Absolute path to a target's tsconfig (the `-p <file>` arg, else tsconfig.json). */
function tsconfigPathOf(t: TscTarget): string {
  const i = t.args.indexOf("-p");
  return join(t.dir, i >= 0 ? t.args[i + 1]! : "tsconfig.json");
}

/**
 * Each target's tsconfig include-expansion — the ROOTS of its program — parsed
 * once and shared, because two things need it: the lint-ownership walk below
 * starts from them, and a target's program key is partly "which roots is this".
 *
 * A target whose tsconfig will not parse is simply ABSENT from the map, never
 * present with an empty list: the broken tsconfig surfaces as a tsc error in
 * that target's own worker, and absent is what stops a program key being minted
 * for a program we could not describe.
 */
function parseTargetRoots(targets: TscTarget[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of targets) {
    const cfgPath = tsconfigPathOf(t);
    const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
    if (cfg.error) continue;
    const parsed = ts.parseJsonConfigFileContent(
      cfg.config,
      ts.sys,
      t.dir,
      undefined,
      cfgPath,
    );
    out.set(
      t.name,
      parsed.fileNames.map((f) => ts.sys.resolvePath(f)),
    );
  }
  return out;
}

/**
 * Assign every lintable file to exactly one target's program for linting.
 * Program membership = include-root files + their forward-import closure, so a
 * reachable-but-not-included file (e.g. a plugin-root config) is owned by the
 * program that actually contains it. `web-core` is processed first so files
 * shared across runtimes (`core`/`shared`) are linted under the same program
 * typescript-eslint's projectService picks for them today (the first matching
 * reference in the root tsconfig), keeping the editor and the check in lockstep.
 */
function computeOwnership(
  root: string,
  targets: TscTarget[],
  targetRoots: Map<string, string[]>,
  forward: Map<string, Set<string>>,
  lintable: Set<string>,
): Map<string, string> {
  const order = [...targets].sort((a, b) =>
    a.name === "web-core" ? -1 : b.name === "web-core" ? 1 : 0,
  );
  const owner = new Map<string, string>();
  for (const t of order) {
    const stack = (targetRoots.get(t.name) ?? [])
      .map((f) => toRel(root, f))
      .filter((r) => lintable.has(r));
    while (stack.length) {
      const cur = stack.pop()!;
      if (!lintable.has(cur) || owner.has(cur)) continue;
      owner.set(cur, t.name);
      const fwd = forward.get(cur);
      if (fwd) for (const dep of fwd) if (!owner.has(dep)) stack.push(dep);
    }
  }
  return owner;
}

/** Bounded-concurrency map: each TS program is large, so cap in-flight workers. */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function runWorker(
  root: string,
  target: TscTarget,
  lintFiles: string[],
  background: boolean,
): Promise<WorkerResult> {
  const jobPath = join(
    os.tmpdir(),
    `type-check-${target.name}-${process.pid}.json`,
  );
  writeFileSync(
    jobPath,
    JSON.stringify({
      root,
      name: target.name,
      tsconfigPath: tsconfigPathOf(target),
      buildInfoPath: tsBuildInfoPath(root, target.name),
      lintFiles,
    }),
  );
  const result = await spawnCaptured([process.execPath, WORKER, jobPath], {
    cwd: root,
    background,
    // A type-check worker builds a whole TypeScript program; on a cold target
    // that is minutes of unavoidable CPU, and on a saturated box (N agent
    // fleets, all demoted to background QoS) it is longer still by an amount
    // nothing here can predict. There is no shorter deadline to borrow: the
    // human running `./singularity check` IS the deadline, and killing a worker
    // that was making progress would just make the check unusable.
    unbounded:
      "a cold type-check worker legitimately runs for minutes of TS program construction, and the CLI run it belongs to owns no shorter deadline",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `type-check worker for "${target.name}" exited ${result.exitCode}:\n${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  // rusage is only final once the child is reaped, and it is a free read (no
  // sampling loop) — getrusage reports the TRUE peak of the run.
  return {
    ...(JSON.parse(result.stdout) as WorkerOutput),
    maxRssBytes: result.resourceUsage.maxRssBytes,
    cpuTimeMicros: result.resourceUsage.cpuTimeMicros,
  };
}

// One greppable line per worker, e.g.
// "type-check worker web-core: cpu 86.6s, maxRSS 2.4 GB".
// THIS fleet is the process class host-admission's `PER_UNIT_BYTES` (3.6e9)
// claims to size — "one type-check-class worker's resident set" — and it had
// never actually been observed; the budget's RAM quantum was calibrated on vite
// samples alone. See research/2026-07-12-global-host-admission-memory-dimension.md.
//
// Units are DECIMAL (1 GB = 1e9 B, 1 MB = 1e6 B), the same convention as the
// CLI's own footprint lines (cli/plugins/build/cli/run.ts `maxRssLine`), because
// PER_UNIT_BYTES is decimal. Labelling a 2**30 division "GB" would understate
// the byte count by ~7% and silently corrupt the very constant these lines
// calibrate. Kept as a private 5-line pure formatter rather than importing the
// CLI's copy: `bin/` is not an importable barrel, and one duplicated formatter
// beats inventing a shared plugin for it.
//
// CPU seconds sit beside the peak because they are the only load-independent
// cost this fleet has: the identical web-core program build measured 105s at
// load 12.8 and 266s at load 14.0, so a wall-clock before/after on a shared box
// measures the neighbours. Every claim about what a target costs — and the
// per-target skip's whole payoff — is read off these numbers.
//
// `null` when the runtime reported NEITHER measurement — an unavailable
// reading, not a swallowed failure: the line is omitted and nothing else
// changes. Either half alone still prints, so one missing number never hides
// the other.
function workerCostLine(
  label: string,
  maxRssBytes: number | undefined,
  cpuTimeMicros: number | undefined,
): string | null {
  const parts: string[] = [];
  if (cpuTimeMicros != null)
    parts.push(`cpu ${(cpuTimeMicros / 1e6).toFixed(1)}s`);
  if (maxRssBytes != null) {
    const gb = maxRssBytes / 1e9;
    parts.push(
      `maxRSS ${gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(maxRssBytes / 1e6)} MB`}`,
    );
  }
  return parts.length === 0 ? null : `${label}: ${parts.join(", ")}`;
}

const check: Check = {
  id: "type-check",
  description:
    "TypeScript types and type-aware ESLint pass (one shared program per tsconfig target)",
  // OUTER input-keyed via validate-by-replay (Stage 2). run() records EVERY input
  // its verdict depends on (lintable-file membership + contents + the global-
  // trigger set) into the recording FileSystemView; on the next run those facts
  // replay against the fresh snapshot, so a change touching NO typecheckable input
  // (e.g. docs-only) is an outer HIT with zero tsc workers. The INNER per-file
  // closure cache (fingerprint.ts / closure-cache.ts) is untouched and orthogonal.
  inputKeyed: true,
  async run(ctx: CheckContext) {
    const root = await getWorktreeRoot();
    const targets = discoverTscTargets(root);

    // ONE reading of the tree's file set, shared by everything below that asks
    // what files exist: the lint universe, the outer read-set, the closure
    // fingerprints, and the program keys. Four separate walks used to cost
    // seconds and gave the enumeration rules four places to disagree — and, as
    // walks, they answered with files git never puts in this check's cache key.
    const listing = await readTreeListing(root);

    // Lint universe + per-file closure fingerprints (the warm-path file filter).
    // A FILTER over the listing, never its own walk: that second enumeration is
    // what let a stray `.ts` under gitignored `.cache/` reach the coverage gate
    // and fail a build over content the key never covered.
    const graphs = buildImportGraphs(root, listing.files);

    // OUTER input-keyed read-set (Stage 2). Only runs on a cache MISS: the runner
    // reaches run() only when validate-by-replay missed (or nothing was recorded
    // yet). On a HIT it short-circuits before run(), so recording — and every
    // root/graph/worker cost below — is skipped entirely (zero workers). The
    // view is null on the legacy whole-tree path (fail-open: a null snapshot in
    // the runner falls back to that path), in which case nothing is recorded and
    // behaviour is unchanged. See ./outer-read-set for what each fact guards.
    const view = currentScanView();
    if (view) recordOuterReadSet(view, listing, graphs);

    const lintable = new Set(graphs.files);
    const { perFile } = computeClosureFingerprints(
      listing,
      graphs,
      graphs.files,
    );

    // Assign every lintable file to one program; assert full coverage (the
    // load-bearing gate that replaces projectService's "every file resolves to
    // a project"). An unowned file would never be linted — fail loudly.
    const targetRoots = parseTargetRoots(targets);
    const owner = computeOwnership(
      root,
      targets,
      targetRoots,
      graphs.forward,
      lintable,
    );
    const uncovered = graphs.files.filter((f) => !owner.has(f));
    if (uncovered.length > 0) {
      return {
        ok: false,
        message: `type-check: ${uncovered.length} lintable file(s) belong to no tsconfig program:\n  ${uncovered.slice(0, 40).join("\n  ")}`,
        hint: 'The lintable set is git-derived, so an uncovered file is genuinely repo source: add its directory to a tsconfig `include` (or its plugin\'s tsconfig) so it is type-checked and linted — the same gap projectService would report as "not found by the project service". If it is NOT source, it does not belong in the git tree: delete it, or add it to .gitignore.',
      };
    }

    // Closure cache: lint only files whose import closure changed since the last
    // recorded PASS. tsc still runs for every target regardless.
    const cache = openClosureCache();
    const lintByTarget = new Map<string, string[]>();
    for (const rel of graphs.files) {
      const fp = perFile.get(rel);
      if (fp && cache.has(rel, fp)) continue; // unchanged closure → already linted
      const t = owner.get(rel)!;
      let bucket = lintByTarget.get(t);
      if (!bucket) lintByTarget.set(t, (bucket = []));
      bucket.push(join(root, rel));
    }

    // One worker per target: tsc for all, lint for those with assigned files.
    // The fleet is bounded by the host CPU GRANT the invoking build/check/push
    // already holds (`ctx.grant`) — this check acquires NOTHING host-wide, it
    // just SPENDS the grant's units. That is the fix for the 2026-07-09 thrash (N
    // overlapping agent builds each spawned `targets.length` multi-GB workers,
    // 30-40 at once): the grant is drawn from the single laned CPU pool, so the
    // host ceiling is `B` workers total, subdivided across every build's fan-out.
    const results: WorkerResult[] = [];
    const crashes: { name: string; error: string }[] = [];
    const background = await workerBackground();

    // Warm any target that has NO local base yet from the host-global pool.
    // That is the fresh-worktree case, which used to be seeded from main's
    // `.cache/tsbuildinfo` — and main's copy goes stale precisely because its
    // auto-build keeps hitting the check-result cache, so the check never runs
    // and never rewrites it. A target that already has a local base keeps it.
    for (const t of targets) materializeWarmBase(root, t.name);

    // PER-TARGET SKIP. An outer-cache MISS used to rebuild all seven programs
    // even when the edit could not possibly reach five of them; the same file
    // was checked 3.7 times per miss. A target's program key says "this exact
    // program — these roots, this content, these options — passed before", and a
    // target whose key is already recorded green has nothing left to compute.
    //
    // Computed AFTER `materializeWarmBase`, because the enumeration of the
    // program comes out of the `.tsbuildinfo` on disk: a fresh worktree that
    // just pulled a sibling's base can skip on its very first run.
    //
    // The `lintByTarget` clause is load-bearing, and so is its ORDERING. If the
    // per-file closure cache has evicted a file's lint PASS, that file must be
    // re-linted, and only its target's worker can do it — so a non-empty lint
    // bucket defeats the skip. Reading it before `lintByTarget` was built would
    // silently make that clause always true.
    //
    // `--no-cache` disarms the SKIP but not the RECORD: someone forcing a real
    // run wants every program rebuilt, and the pass it produces is still a
    // perfectly good fact to keep.
    const skipEnabled = ctx.cacheEnabled !== false;
    const keyStart = performance.now();
    const keyCtx = openProgramKeyContext(listing);
    const passes = openProgramPasses();
    const keyByTarget = new Map<string, string>();
    const skipped = new Set<string>();
    const unkeyed: string[] = [];
    for (const t of targets) {
      const roots = targetRoots.get(t.name);
      if (roots === undefined) {
        unkeyed.push(`${t.name}: tsconfig did not parse`);
        continue; // its own worker reports the broken tsconfig
      }
      const result = programKey(
        keyCtx,
        {
          name: t.name,
          tsconfigPath: tsconfigPathOf(t),
          buildInfoPath: tsBuildInfoPath(root, t.name),
        },
        roots,
      );
      if (result.kind !== "key") {
        unkeyed.push(`${t.name}: ${result.why}`);
        continue; // no enumeration → cold run, then recorded below
      }
      keyByTarget.set(t.name, result.key);
      if (
        skipEnabled &&
        passes.has(t.name, result.key) &&
        (lintByTarget.get(t.name) ?? []).length === 0
      ) {
        skipped.add(t.name);
      }
    }
    const toRun = targets.filter((t) => !skipped.has(t.name));
    // Emitted on EVERY run, including "skipped 0" — the zero is the datum that
    // says the key was computed and matched nothing, which is what separates a
    // cold tree from a broken key. The cost of computing the keys is on the
    // same line because it is paid whether or not anything is skipped.
    ctx.log?.(
      `type-check: skipped ${skipped.size} of ${targets.length} targets, program unchanged since last pass` +
        (skipped.size > 0 ? `: ${[...skipped].sort().join(", ")}` : "") +
        ` (program keys ${Math.round(performance.now() - keyStart)}ms)`,
      "stderr",
    );
    // Named, not just counted: "5 of 7 skipped" with no explanation of the
    // other two is the shape of a report that hides a broken key. A cold
    // worktree legitimately lists every target here on its first run.
    if (unkeyed.length > 0) {
      ctx.log?.(
        `type-check: no program key for ${unkeyed.length} target(s) — ${unkeyed.join("; ")}`,
        "stderr",
      );
    }

    // Fan out at exactly `grant.units` concurrency, spending one unit per worker
    // via `grant.run`. A reduced grant (`units < toRun.length`) simply runs the
    // fleet at lower concurrency — surfaced as ONE observation line through the
    // runner's `ctx.log` seam, so it lands in check-<id>.log/build.log and not only in
    // a terminal (never a blocking log or a progress bar: checks run under
    // Promise.all in the runner, which buffers and attributes these lines).
    const units = ctx.grant.units;
    if (units < toRun.length) {
      ctx.log?.(
        `type-check: ${units} of ${toRun.length} targets run concurrently (host CPU grant)`,
        "stderr",
      );
    }
    await mapConcurrent(toRun, units, (t) =>
      ctx.grant.run(async () => {
        try {
          results.push(
            await runWorker(
              root,
              t,
              lintByTarget.get(t.name) ?? [],
              background,
            ),
          );
        } catch (err) {
          crashes.push({ name: t.name, error: (err as Error).message });
        }
      }),
    );

    // Peak RSS of every worker that ran, one labelled line per target (target
    // order, not completion order, so successive runs are diffable). Emitted
    // through the runner's `ctx.log` observation seam, so the measurement is
    // DURABLE (check-<id>.log + the build's checks section) — a terminal-only write
    // would evaporate, and calibrating host-admission's RAM quantum is exactly
    // an after-the-fact grep over many runs. Purely an observation: a missing
    // rusage, or a crashed worker (which threw before it could be measured),
    // changes nothing about the verdict below.
    const byName = new Map(results.map((r) => [r.name, r]));
    for (const t of targets) {
      const r = byName.get(t.name);
      const line = workerCostLine(
        `type-check worker ${t.name}`,
        r?.maxRssBytes,
        r?.cpuTimeMicros,
      );
      if (line !== null) ctx.log?.(line, "stderr");
    }

    // Publish each worker's buildinfo as a warm base for whoever runs next.
    // Publish even when the check FAILED with diagnostics: the buildinfo records
    // program STATE, which is valid regardless of the verdict — a run that found
    // type errors is still a perfectly good incremental base. `results` holds
    // only workers that returned, so a target in `crashes[]` is already excluded
    // here, which is what we want: a crashed worker may have left torn state.
    for (const r of results) publishWarmBase(root, r.name);

    // Record per-file lint PASSes for every file we sent that did NOT fail.
    // (Conservative: a crashed worker records nothing — re-lints next time.)
    for (const r of results) {
      const failed = new Set(r.failedLintFiles);
      for (const abs of lintByTarget.get(r.name) ?? []) {
        if (failed.has(abs)) continue;
        const fp = perFile.get(toRel(root, abs));
        if (fp) cache.record(toRel(root, abs), fp);
      }
    }

    // Record a program PASS for every target whose worker came back completely
    // clean. The key is RECOMPUTED from the buildinfo the worker just WROTE, so
    // what is recorded describes the program that actually passed rather than
    // the one predicted before it ran — on a cold target the two differ, since
    // there was no enumeration to predict from at all.
    //
    // Only fully-clean targets record. A tsc error obviously must not be
    // recorded green; a lint failure need not block a TSC key, but keeping the
    // rule "clean means clean" costs one re-run of a target that was failing
    // anyway and leaves nothing to reason about later.
    for (const r of results) {
      if (r.tscErrors || r.lintViolations || r.failedLintFiles.length > 0) {
        continue;
      }
      const target = targets.find((t) => t.name === r.name);
      const roots = target && targetRoots.get(r.name);
      if (!target || roots === undefined) continue;
      const result = programKey(
        keyCtx,
        {
          name: r.name,
          tsconfigPath: tsconfigPathOf(target),
          buildInfoPath: tsBuildInfoPath(root, r.name),
        },
        roots,
      );
      if (result.kind === "key") passes.record(r.name, result.key);
    }

    // Re-record the key of every SKIPPED target. Not a new claim — it is the
    // identical key that was already green — but the store ages entries out by
    // when they were last WRITTEN, so without this a target that skips
    // successfully every day for a fortnight would be evicted for being unused
    // and pay a cold run. One tiny write per skipped target turns the age bound
    // into "unused for 14 days", which is what it was always meant to say.
    for (const name of skipped) {
      const key = keyByTarget.get(name);
      if (key !== undefined) passes.record(name, key);
    }

    // Aggregate the two failure categories.
    const tscSections = results
      .filter((r) => r.tscErrors)
      .map((r) => `${r.name}:\n    ${r.tscErrors.split("\n").join("\n    ")}`);
    const lintLines = results
      .filter((r) => r.lintViolations)
      .map((r) => r.lintViolations)
      .join("\n");

    if (crashes.length === 0 && tscSections.length === 0 && !lintLines)
      return { ok: true };

    const parts: string[] = [];
    if (crashes.length > 0) {
      parts.push(
        `type-check workers failed:\n  ${crashes.map((c) => `${c.name}: ${c.error}`).join("\n  ")}`,
      );
    }
    if (tscSections.length > 0) {
      parts.push(`TypeScript type errors:\n  ${tscSections.join("\n  ")}`);
    }
    if (lintLines) {
      parts.push(`ESLint violations:\n  ${lintLines.split("\n").join("\n  ")}`);
    }

    const combined = tscSections.join("\n");
    const hasMissingModule = /error TS2307: Cannot find module/.test(combined);
    const hints: string[] = [];
    if (hasMissingModule) {
      hints.push(
        'A "Cannot find module" error for a dep you didn\'t touch is usually a missing workspace link — run ./singularity build first (it re-runs bun install) and re-push.',
      );
    }
    if (tscSections.length > 0) {
      hints.push(
        "Fix type errors before pushing. If a cast is necessary, fix the type definition instead.",
      );
    }
    if (lintLines) {
      hints.push(
        "Global rules live in plugins/framework/plugins/tooling/plugins/lint/; plugin rules in plugins/<name>/lint/index.ts. Do NOT silence violations with eslint-disable or rule-config edits. If you believe a violation is a false positive, STOP and report it to the user.",
      );
    }

    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: hints.join(" ") || undefined,
    };
  },
};

export default check;
