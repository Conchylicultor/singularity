import os from "os";
import {
  buildImportGraphs,
  computeClosureFingerprints,
  openEslintClosureCache,
} from "@plugins/framework/plugins/tooling/plugins/checks/plugins/eslint/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
};

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Concurrent eslint worker count for a cold/large re-lint.
 *
 * Type-aware linting is ~99% single-threaded TypeScript program construction, so
 * the only lever on wall-clock is running several eslint processes in parallel.
 * Each worker holds its own full TS program (~2.7 GB peak for this repo), so the
 * count is bounded by three independent ceilings — cores, free memory, and the
 * file count (no point spawning more workers than ~150-file chunks). A small set
 * (warm cache, narrow change) collapses to a single process.
 */
function workerCount(fileCount: number): number {
  const PER_WORKER_BYTES = 2.7e9;
  const TARGET_PER_WORKER = 150;
  const byCpu = Math.max(1, os.cpus().length - 1);
  const byMem = Math.max(1, Math.floor((os.totalmem() * 0.5) / PER_WORKER_BYTES));
  const byFiles = Math.max(1, Math.ceil(fileCount / TARGET_PER_WORKER));
  return Math.min(byCpu, byMem, byFiles);
}

/**
 * Round-robin shard. Spreading each file across workers by index keeps every
 * tsconfig project represented in every shard, so no single worker becomes the
 * long pole on one giant program — measured ~14× wall-clock speedup at 8 workers
 * versus a single process on a full-repo cold run.
 */
function shardFiles(files: string[], n: number): string[][] {
  const shards: string[][] = Array.from({ length: n }, () => []);
  files.forEach((f, i) => shards[i % n]!.push(f));
  return shards.filter((s) => s.length > 0);
}

const check: Check = {
  id: "eslint",
  description: "ESLint rules pass (global + plugin-contributed)",
  async run() {
    const root = await getRoot();

    // One path for build, push, and check: fingerprint every lintable file on its
    // full dependency closure, then lint only the ones whose closure changed. The
    // per-file closure cache (keyed on each file's content + transitive forward
    // import closure + global config) carries soundness and cross-run/worktree
    // reuse, so there is no git-diff candidate narrowing — the full set is cheap
    // because everything but a changed closure is a cache hit.
    const graphs = buildImportGraphs(root);
    const { perFile } = computeClosureFingerprints(root, graphs, graphs.files);

    const cache = openEslintClosureCache();
    const toLint = graphs.files.filter((f) => {
      const fp = perFile.get(f);
      return !fp || !cache.has(f, fp); // unreadable fingerprint → lint to be safe
    });
    if (toLint.length === 0) return { ok: true };

    // Lint the not-yet-cached set with NO native --cache: the closure cache
    // above already does the (sound, cross-file) caching, and eslint's
    // content-`--cache` would be unsound for type-aware rules.
    //
    // Shard across worker processes that lint concurrently: a cold run (a
    // global-config change or a hot dependency edit invalidates a large closure
    // set) re-lints thousands of files, and type-aware eslint is single-threaded
    // per process. Each shard is an independent invocation, so failures attribute
    // per shard — a passing shard records its files' PASSes (finer-grained than
    // the old all-or-nothing batch), a failing shard records nothing.
    const shards = shardFiles(toLint, workerCount(toLint.length));
    const results = await Promise.all(
      shards.map(async (files) => {
        const proc = Bun.spawn(
          [process.execPath, "x", "eslint", ...files, "--quiet"],
          { cwd: root, stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        return { files, stdout, stderr, exitCode };
      }),
    );

    // Record a PASS per file for every shard that passed. A failing shard records
    // NOTHING — conservative (re-lints next time, never a false PASS).
    for (const r of results) {
      if (r.exitCode !== 0) continue;
      for (const f of r.files) {
        const fp = perFile.get(f);
        if (fp) cache.record(f, fp);
      }
    }
    const failed = results.filter((r) => r.exitCode !== 0);
    if (failed.length === 0) return { ok: true };

    const combined = failed
      .map((r) => [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n")
      .trim();
    return {
      ok: false,
      message: `ESLint reported violations:\n  ${combined.split("\n").join("\n  ")}`,
      hint: "Global rules live in plugins/framework/plugins/tooling/plugins/lint/core/; plugin rules in plugins/<name>/lint/index.ts. Do NOT silence violations with eslint-disable comments or modify rule configs to make them pass. If you believe a violation is a false positive, STOP and report it to the user — do not work around it.",
    };
  },
};

export default check;
