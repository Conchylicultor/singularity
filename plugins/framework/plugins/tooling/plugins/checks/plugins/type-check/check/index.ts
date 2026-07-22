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
import { getWorktreeRoot, spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type { Check, CheckContext } from "@plugins/framework/plugins/tooling/core";
import { buildImportGraphs } from "./import-graph";
import { computeClosureFingerprints } from "./fingerprint";
import { openClosureCache } from "./closure-cache";
import { recordOuterReadSet } from "./outer-read-set";

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
  const result = await spawnCaptured(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  return result.stdout.trim() !== "main";
}

const toRel = (root: string, abs: string): string => relative(root, abs).split("\\").join("/");

/** Absolute path to a target's tsconfig (the `-p <file>` arg, else tsconfig.json). */
function tsconfigPathOf(t: TscTarget): string {
  const i = t.args.indexOf("-p");
  return join(t.dir, i >= 0 ? t.args[i + 1]! : "tsconfig.json");
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
  forward: Map<string, Set<string>>,
  lintable: Set<string>,
): Map<string, string> {
  const order = [...targets].sort((a, b) => (a.name === "web-core" ? -1 : b.name === "web-core" ? 1 : 0));
  const owner = new Map<string, string>();
  for (const t of order) {
    const cfg = ts.readConfigFile(tsconfigPathOf(t), ts.sys.readFile);
    if (cfg.error) continue; // a broken tsconfig surfaces as a tsc error in its worker
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, t.dir, undefined, tsconfigPathOf(t));
    const stack = parsed.fileNames
      .map((f) => toRel(root, ts.sys.resolvePath(f)))
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
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function runWorker(
  root: string,
  target: TscTarget,
  lintFiles: string[],
  background: boolean,
): Promise<WorkerResult> {
  const jobPath = join(os.tmpdir(), `type-check-${target.name}-${process.pid}.json`);
  writeFileSync(jobPath, JSON.stringify({
    root,
    name: target.name,
    tsconfigPath: tsconfigPathOf(target),
    buildInfoPath: tsBuildInfoPath(root, target.name),
    lintFiles,
  }));
  const result = await spawnCaptured([process.execPath, WORKER, jobPath], { cwd: root, background });
  if (result.exitCode !== 0) {
    throw new Error(`type-check worker for "${target.name}" exited ${result.exitCode}:\n${result.stderr.trim() || result.stdout.trim()}`);
  }
  // rusage is only final once the child is reaped, and it is a free read (no
  // sampling loop) — getrusage reports the TRUE peak of the run.
  return { ...(JSON.parse(result.stdout) as WorkerOutput), maxRssBytes: result.resourceUsage.maxRssBytes };
}

// One greppable line per worker, e.g. "type-check worker web-core: maxRSS 2.4 GB".
// THIS fleet is the process class host-admission's `PER_UNIT_BYTES` (2.7e9)
// claims to size — "one type-check-class worker's resident set" — and it had
// never actually been observed; the budget's RAM quantum was calibrated on vite
// samples alone. See research/2026-07-12-global-host-admission-memory-dimension.md.
//
// Units are DECIMAL (1 GB = 1e9 B, 1 MB = 1e6 B), the same convention as the
// CLI's own footprint lines (cli/bin/commands/build.ts `maxRssLine`), because
// PER_UNIT_BYTES is decimal. Labelling a 2**30 division "GB" would understate
// the byte count by ~7% and silently corrupt the very constant these lines
// calibrate. Kept as a private 5-line pure formatter rather than importing the
// CLI's copy: `bin/` is not an importable barrel, and one duplicated formatter
// beats inventing a shared plugin for it.
//
// `null` when the runtime reported no rusage — an unavailable measurement, not
// a swallowed failure: the line is omitted and nothing else changes.
function maxRssLine(label: string, maxRssBytes: number | undefined): string | null {
  if (maxRssBytes == null) return null;
  const gb = maxRssBytes / 1e9;
  const amount = gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(maxRssBytes / 1e6)} MB`;
  return `${label}: maxRSS ${amount}`;
}

const check: Check = {
  id: "type-check",
  description: "TypeScript types and type-aware ESLint pass (one shared program per tsconfig target)",
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

    // Lint universe + per-file closure fingerprints (the warm-path file filter).
    const graphs = buildImportGraphs(root);

    // OUTER input-keyed read-set (Stage 2). Only runs on a cache MISS: the runner
    // reaches run() only when validate-by-replay missed (or nothing was recorded
    // yet). On a HIT it short-circuits before run(), so recording — and every
    // root/graph/worker cost below — is skipped entirely (zero workers). The
    // view is null on the legacy whole-tree path (fail-open: a null snapshot in
    // the runner falls back to that path), in which case nothing is recorded and
    // behaviour is unchanged. See ./outer-read-set for what each fact guards.
    const view = currentScanView();
    if (view) recordOuterReadSet(view, root, graphs);

    const lintable = new Set(graphs.files);
    const { perFile } = computeClosureFingerprints(root, graphs, graphs.files);

    // Assign every lintable file to one program; assert full coverage (the
    // load-bearing gate that replaces projectService's "every file resolves to
    // a project"). An unowned file would never be linted — fail loudly.
    const owner = computeOwnership(root, targets, graphs.forward, lintable);
    const uncovered = graphs.files.filter((f) => !owner.has(f));
    if (uncovered.length > 0) {
      return {
        ok: false,
        message: `type-check: ${uncovered.length} lintable file(s) belong to no tsconfig program:\n  ${uncovered.slice(0, 40).join("\n  ")}`,
        hint: "Add the file's directory to a tsconfig `include` (or its plugin's tsconfig) so it is type-checked and linted. This is the same gap projectService would report as \"not found by the project service\".",
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

    // Fan out at exactly `grant.units` concurrency, spending one unit per worker
    // via `grant.run`. A reduced grant (`units < targets.length`) simply runs the
    // fleet at lower concurrency — surfaced as ONE observation line through the
    // runner's `ctx.log` seam, so it lands in check.log/build.log and not only in
    // a terminal (never a blocking log or a progress bar: checks run under
    // Promise.all in the runner, which buffers and attributes these lines).
    const units = ctx.grant.units;
    if (units < targets.length) {
      ctx.log?.(
        `type-check: ${units} of ${targets.length} targets run concurrently (host CPU grant)`,
        "stderr",
      );
    }
    await mapConcurrent(targets, units, (t) =>
      ctx.grant.run(async () => {
        try {
          results.push(await runWorker(root, t, lintByTarget.get(t.name) ?? [], background));
        } catch (err) {
          crashes.push({ name: t.name, error: (err as Error).message });
        }
      }),
    );

    // Peak RSS of every worker that ran, one labelled line per target (target
    // order, not completion order, so successive runs are diffable). Emitted
    // through the runner's `ctx.log` observation seam, so the measurement is
    // DURABLE (check.log + the build's checks section) — a terminal-only write
    // would evaporate, and calibrating host-admission's RAM quantum is exactly
    // an after-the-fact grep over many runs. Purely an observation: a missing
    // rusage, or a crashed worker (which threw before it could be measured),
    // changes nothing about the verdict below.
    const byName = new Map(results.map((r) => [r.name, r]));
    for (const t of targets) {
      const line = maxRssLine(`type-check worker ${t.name}`, byName.get(t.name)?.maxRssBytes);
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

    // Aggregate the two failure categories.
    const tscSections = results
      .filter((r) => r.tscErrors)
      .map((r) => `${r.name}:\n    ${r.tscErrors.split("\n").join("\n    ")}`);
    const lintLines = results
      .filter((r) => r.lintViolations)
      .map((r) => r.lintViolations)
      .join("\n");

    if (crashes.length === 0 && tscSections.length === 0 && !lintLines) return { ok: true };

    const parts: string[] = [];
    if (crashes.length > 0) {
      parts.push(`type-check workers failed:\n  ${crashes.map((c) => `${c.name}: ${c.error}`).join("\n  ")}`);
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
      hints.push("A \"Cannot find module\" error for a dep you didn't touch is usually a missing workspace link — run ./singularity build first (it re-runs bun install) and re-push.");
    }
    if (tscSections.length > 0) {
      hints.push("Fix type errors before pushing. If a cast is necessary, fix the type definition instead.");
    }
    if (lintLines) {
      hints.push("Global rules live in plugins/framework/plugins/tooling/plugins/lint/; plugin rules in plugins/<name>/lint/index.ts. Do NOT silence violations with eslint-disable or rule-config edits. If you believe a violation is a false positive, STOP and report it to the user.");
    }

    return { ok: false, message: parts.join("\n\n"), hint: hints.join(" ") || undefined };
  },
};

export default check;
