// Everything type-check does that reads file bytes or walks the tree, before and
// after the per-target tsc workers: the import graph, the closure fingerprints,
// each tsconfig's include-expansion, lint ownership and the coverage gate, the
// closure-cache lookups, the warm-base materialize, the program keys — and,
// once the workers are back, every record.
//
// It is 70–130 s of SYNCHRONOUS work, and it used to run on the check runner's
// own thread. `./singularity check` runs every selected check concurrently in
// one process, so for that whole stretch no other check made progress: no
// timer fired, no socket was serviced. `migration-applies-clean` opened a pg
// connection, Postgres dropped it after its 60 s `authentication_timeout`, and
// the check failed with ECONNREFUSED. See
// research/2026-09-10-tooling-type-check-prepare-off-thread.md.
//
// So this module runs on its own thread (`./prepare-worker`, hosted by
// `./prepare-thread`), and `./index` must never import it. It has no thread
// knowledge itself: `openPreparation` is plain in-process code, which is what
// lets a test compare the thread's plan with one computed here.
//
// ONE session per run, in two phases, because the record phase needs state the
// prepare phase built: the closure fingerprint of every file sent to lint, the
// key of every skipped target, and above all `keyCtx.contentHash`, the memo the
// post-run key recompute reuses. Keeping that memo in memory is what keeps the
// recorded program key exactly what it was when this all ran in one function.
//
// The three orderings `../CLAUDE.md` calls load-bearing all live inside this
// one module, in the order they always ran: keys AFTER `materializeWarmBase`;
// the skip clause AFTER `lintByTarget` is built; a PASS recorded from the
// buildinfo the worker WROTE, through the same `keyCtx`.

import { join, relative } from "path";
import ts from "typescript";
import {
  discoverTscTargets,
  tsBuildInfoPath,
  materializeWarmBase,
  publishWarmBase,
  type TscTarget,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { buildImportGraphs } from "./import-graph";
import { computeClosureFingerprints, type TreeListing } from "./fingerprint";
import { openClosureCache } from "./closure-cache";
import {
  openProgramKeyContext,
  openProgramPasses,
  programKey,
} from "./program-key";

/** What the runner hands the session. Structured-cloned to the thread. */
export interface PrepareInput {
  /**
   * The run's ONE reading of the tree — the same value the runner recorded the
   * outer read-set from, so this side never re-lists and cannot see a
   * different tree than the one recorded. Its `root` is the worktree root.
   */
  listing: TreeListing;
  /**
   * `ctx.cacheEnabled !== false`. Disarms the per-target SKIP, never the
   * record: someone forcing a real run wants every program rebuilt, and the
   * pass it produces is still a good fact to keep.
   */
  cacheEnabled: boolean;
}

/** A target as the runner needs it to spawn its worker. */
export interface PlannedTarget {
  name: string;
  /** Absolute path of the tsconfig the worker builds (`-p <file>`, else `tsconfig.json`). */
  tsconfigPath: string;
}

/**
 * What the runner does next. Plain data — it crosses the thread boundary.
 *
 * `uncovered` is the coverage gate: some lintable file belongs to no tsconfig
 * program, so there is nothing to run and nothing to record. It is returned
 * before any cache is opened.
 */
export type Plan =
  | { kind: "uncovered"; uncovered: string[] }
  | {
      kind: "run";
      /** Every discovered target, in discovery order (the cost lines follow it). */
      targets: PlannedTarget[];
      /** Names of the targets whose worker must run. */
      toRun: string[];
      /** Absolute paths of the files each target's worker must lint. */
      lintByTarget: Record<string, string[]>;
      /** Targets whose program key is already recorded green. Sorted. */
      skipped: string[];
      /** `<target>: <why>` for every target that could not be keyed. */
      unkeyed: string[];
      /** What computing the program keys cost, rounded. */
      keysMs: number;
    };

/** One worker that came back (a crashed worker has no outcome, and records nothing). */
export interface TargetOutcome {
  name: string;
  /** No tsc error, no lint violation, no failed lint file. */
  clean: boolean;
  /** Absolute paths, as the worker reports them. */
  failedLintFiles: string[];
}

/**
 * A prepared run. Only a `run` plan has anything to finalize, so only that arm
 * carries `finalize` — narrow with `"finalize" in preparation`.
 */
export type Preparation =
  | { plan: Extract<Plan, { kind: "uncovered" }> }
  | {
      plan: Extract<Plan, { kind: "run" }>;
      /** The record phase, in the order it always ran. Call once, with every outcome. */
      finalize(outcomes: TargetOutcome[]): void;
    };

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

/** Prepare one run: the plan, and the session its record phase closes over. */
export function openPreparation({
  listing,
  cacheEnabled,
}: PrepareInput): Preparation {
  const { root } = listing;
  const targets = discoverTscTargets(root);

  // Lint universe + per-file closure fingerprints (the warm-path file filter).
  // A FILTER over the listing, never its own walk: that second enumeration is
  // what let a stray `.ts` under gitignored `.cache/` reach the coverage gate
  // and fail a build over content the key never covered.
  const graphs = buildImportGraphs(listing);
  const lintable = new Set(graphs.files);
  const { perFile } = computeClosureFingerprints(listing, graphs, graphs.files);

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
  if (uncovered.length > 0) return { plan: { kind: "uncovered", uncovered } };

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
      cacheEnabled &&
      passes.has(t.name, result.key) &&
      (lintByTarget.get(t.name) ?? []).length === 0
    ) {
      skipped.add(t.name);
    }
  }
  const keysMs = Math.round(performance.now() - keyStart);

  const plan: Extract<Plan, { kind: "run" }> = {
    kind: "run",
    targets: targets.map((t) => ({
      name: t.name,
      tsconfigPath: tsconfigPathOf(t),
    })),
    toRun: targets.filter((t) => !skipped.has(t.name)).map((t) => t.name),
    lintByTarget: Object.fromEntries(lintByTarget),
    skipped: [...skipped].sort(),
    unkeyed,
    keysMs,
  };

  function finalize(outcomes: TargetOutcome[]): void {
    // Publish each worker's buildinfo as a warm base for whoever runs next.
    // Publish even when the check FAILED with diagnostics: the buildinfo records
    // program STATE, which is valid regardless of the verdict — a run that found
    // type errors is still a perfectly good incremental base. `outcomes` holds
    // only workers that returned, so a crashed target is already excluded
    // here, which is what we want: a crashed worker may have left torn state.
    for (const o of outcomes) publishWarmBase(root, o.name);

    // Record per-file lint PASSes for every file we sent that did NOT fail.
    // (Conservative: a crashed worker records nothing — re-lints next time.)
    for (const o of outcomes) {
      const failed = new Set(o.failedLintFiles);
      for (const abs of lintByTarget.get(o.name) ?? []) {
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
    for (const o of outcomes) {
      if (!o.clean) continue;
      const target = targets.find((t) => t.name === o.name);
      const roots = target && targetRoots.get(o.name);
      if (!target || roots === undefined) continue;
      const result = programKey(
        keyCtx,
        {
          name: o.name,
          tsconfigPath: tsconfigPathOf(target),
          buildInfoPath: tsBuildInfoPath(root, o.name),
        },
        roots,
      );
      if (result.kind === "key") passes.record(o.name, result.key);
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
  }

  return { plan, finalize };
}
