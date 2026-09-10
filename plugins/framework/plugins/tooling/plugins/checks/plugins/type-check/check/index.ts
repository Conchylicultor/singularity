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
 *
 * This file runs on the check runner's thread, which every other check in the
 * pass shares, so it holds nothing that reads file bytes or walks the tree: the
 * git reads (async), the outer read-set, the grant fan-out, the log lines and
 * the verdict. Everything else — 70–130 s of synchronous work — runs on the
 * preparation thread (`./prepare-thread`, `./prepare`).
 */
import { writeFileSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { join } from "path";
import {
  tsBuildInfoPath,
  currentScanView,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import type {
  Check,
  CheckContext,
} from "@plugins/framework/plugins/tooling/core";
import { readTreeListing } from "./fingerprint";
import { recordOuterReadSet } from "./outer-read-set";
import { openPrepareThread } from "./prepare-thread";
import type { PlannedTarget, TargetOutcome } from "./prepare";

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
  target: PlannedTarget,
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
      tsconfigPath: target.tsconfigPath,
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

/** Milliseconds as the seconds figure of a log line, e.g. `71.3`. */
const seconds = (ms: number): string => (ms / 1000).toFixed(1);

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

    // ONE reading of the tree's file set, shared by everything that asks what
    // files exist: the lint universe, the outer read-set, the closure
    // fingerprints, and the program keys. Four separate walks used to cost
    // seconds and gave the enumeration rules four places to disagree — and, as
    // walks, they answered with files git never puts in this check's cache key.
    const listing = await readTreeListing(root);

    // OUTER input-keyed read-set (Stage 2). Only runs on a cache MISS: the runner
    // reaches run() only when validate-by-replay missed (or nothing was recorded
    // yet). On a HIT it short-circuits before run(), so recording — and every
    // root/graph/worker cost below — is skipped entirely (zero workers). The
    // view is null on the legacy whole-tree path (fail-open: a null snapshot in
    // the runner falls back to that path), in which case nothing is recorded and
    // behaviour is unchanged. See ./outer-read-set for what each fact guards.
    //
    // Recorded HERE, from the listing, before the preparation thread starts:
    // the view belongs to this thread's run, and the facts need no file read.
    const view = currentScanView();
    if (view) recordOuterReadSet(view, listing);

    // One worker per target: tsc for all, lint for those with assigned files.
    // The fleet is bounded by the host CPU GRANT the invoking build/check/push
    // already holds (`ctx.grant`) — this check acquires NOTHING host-wide, it
    // just SPENDS the grant's units. That is the fix for the 2026-07-09 thrash (N
    // overlapping agent builds each spawned `targets.length` multi-GB workers,
    // 30-40 at once): the grant is drawn from the single laned CPU pool, so the
    // host ceiling is `B` workers total, subdivided across every build's fan-out.
    const results: WorkerResult[] = [];
    const crashes: { name: string; error: string }[] = [];

    // Everything that reads file bytes or walks the tree — the import graph,
    // fingerprints, tsconfig include-expansion, ownership + coverage gate,
    // closure cache, warm base, program keys, and the records after the fan-out
    // — runs on the preparation thread, so this thread (shared by every other
    // check in the pass) keeps servicing timers and sockets throughout.
    const thread = openPrepareThread();
    try {
      const prepareStart = performance.now();
      const plan = await thread.prepare({
        listing,
        cacheEnabled: ctx.cacheEnabled !== false,
      });
      const prepareMs = performance.now() - prepareStart;

      // The coverage gate: an unowned file would never be linted — fail loudly.
      if (plan.kind === "uncovered") {
        ctx.log?.(
          `type-check: prepared off-thread in ${seconds(prepareMs)}s (finalize skipped: coverage gate failed)`,
          "stderr",
        );
        const { uncovered } = plan;
        return {
          ok: false,
          message: `type-check: ${uncovered.length} lintable file(s) belong to no tsconfig program:\n  ${uncovered.slice(0, 40).join("\n  ")}`,
          hint: 'The lintable set is git-derived, so an uncovered file is genuinely repo source: add its directory to a tsconfig `include` (or its plugin\'s tsconfig) so it is type-checked and linted — the same gap projectService would report as "not found by the project service". If it is NOT source, it does not belong in the git tree: delete it, or add it to .gitignore.',
        };
      }

      const { targets, skipped, unkeyed } = plan;
      const toRun = targets.filter((t) => plan.toRun.includes(t.name));
      // Emitted on EVERY run, including "skipped 0" — the zero is the datum that
      // says the key was computed and matched nothing, which is what separates a
      // cold tree from a broken key. The cost of computing the keys is on the
      // same line because it is paid whether or not anything is skipped.
      ctx.log?.(
        `type-check: skipped ${skipped.length} of ${targets.length} targets, program unchanged since last pass` +
          (skipped.length > 0 ? `: ${skipped.join(", ")}` : "") +
          ` (program keys ${plan.keysMs}ms)`,
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

      const background = await workerBackground();

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
                plan.lintByTarget[t.name] ?? [],
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

      // The record phase, on the thread that holds the session: warm bases,
      // per-file lint PASSes, program PASSes, skipped re-records (see
      // `./prepare`). Only workers that RETURNED are handed over — a crashed
      // worker records nothing. "Clean" is decided here because only this side
      // has the outputs: no tsc error, no lint violation, no failed lint file.
      const outcomes: TargetOutcome[] = results.map((r) => ({
        name: r.name,
        clean:
          !r.tscErrors && !r.lintViolations && r.failedLintFiles.length === 0,
        failedLintFiles: r.failedLintFiles,
      }));
      const finalizeStart = performance.now();
      await thread.finalize(outcomes);
      // What used to be a freeze of the runner's thread, still measured: the
      // instrument for making the preparation itself cheaper.
      ctx.log?.(
        `type-check: prepared off-thread in ${seconds(prepareMs)}s (finalize ${seconds(performance.now() - finalizeStart)}s)`,
        "stderr",
      );
    } finally {
      thread.close();
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
