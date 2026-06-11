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
  type TscTarget,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  buildImportGraphs,
  computeClosureFingerprints,
  openEslintClosureCache,
} from "@plugins/framework/plugins/tooling/plugins/checks/plugins/eslint/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

interface WorkerResult {
  name: string;
  tscErrors: string;
  lintViolations: string;
  failedLintFiles: string[];
}

const WORKER = fileURLToPath(new URL("../shared/worker.ts", import.meta.url));

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  return (await new Response(proc.stdout).text()).trim();
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

async function runWorker(root: string, target: TscTarget, lintFiles: string[]): Promise<WorkerResult> {
  const jobPath = join(os.tmpdir(), `type-check-${target.name}-${process.pid}.json`);
  writeFileSync(jobPath, JSON.stringify({
    root,
    name: target.name,
    tsconfigPath: tsconfigPathOf(target),
    buildInfoPath: tsBuildInfoPath(root, target.name),
    lintFiles,
  }));
  const proc = Bun.spawn([process.execPath, WORKER, jobPath], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`type-check worker for "${target.name}" exited ${exitCode}:\n${stderr.trim() || stdout.trim()}`);
  }
  return JSON.parse(stdout) as WorkerResult;
}

const check: Check = {
  id: "type-check",
  description: "TypeScript types and type-aware ESLint pass (one shared program per tsconfig target)",
  async run() {
    const root = await getRoot();
    const targets = discoverTscTargets(root);

    // Lint universe + per-file closure fingerprints (the warm-path file filter).
    const graphs = buildImportGraphs(root);
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
    const cache = openEslintClosureCache();
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
    const PER_WORKER_BYTES = 2.7e9;
    const limit = Math.max(
      1,
      Math.min(targets.length, os.cpus().length - 1, Math.floor((os.totalmem() * 0.5) / PER_WORKER_BYTES)),
    );
    const results: WorkerResult[] = [];
    const crashes: { name: string; error: string }[] = [];
    await mapConcurrent(targets, limit, async (t) => {
      try {
        results.push(await runWorker(root, t, lintByTarget.get(t.name) ?? []));
      } catch (err) {
        crashes.push({ name: t.name, error: (err as Error).message });
      }
    });

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
