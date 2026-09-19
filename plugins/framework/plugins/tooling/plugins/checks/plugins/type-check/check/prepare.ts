// Everything type-check does that reads file bytes or walks the tree, before and
// after the tsc worker: the import graph, the closure fingerprints, the
// tsconfig's include-expansion and the coverage gate, the closure-cache lookups,
// the warm-base materialize, the program key — and, once the worker is back,
// every record.
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
// program key when it skipped, and above all `keyCtx.contentHash`, the memo the
// post-run key recompute reuses. Keeping that memo in memory is what keeps the
// recorded program key exactly what it was when this all ran in one function.
//
// The three orderings `../CLAUDE.md` calls load-bearing all live inside this
// one module, in the order they always ran: the key AFTER `materializeWarmBase`;
// the skip clause AFTER `lintFiles` is built; a PASS recorded from the
// buildinfo the worker WROTE, through the same `keyCtx`.

import { join, relative } from "path";
import ts from "typescript";
import {
  repoProgram,
  tsBuildInfoPath,
  materializeWarmBase,
  publishWarmBase,
  realGitFacts,
  type ContentHashMemo,
  type TscProgram,
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
   * `ctx.cacheEnabled !== false`. Disarms the SKIP, never the record: someone
   * forcing a real run wants the program rebuilt, and the pass it produces is
   * still a good fact to keep.
   */
  cacheEnabled: boolean;
}

/**
 * What the runner does next. Plain data — it crosses the thread boundary.
 *
 * `uncovered` is the coverage gate: some lintable file is not a root of the
 * program, so there is nothing to run and nothing to record. It is returned
 * before any cache is opened.
 */
export type Plan =
  | { kind: "uncovered"; uncovered: string[] }
  | {
      kind: "run";
      /** The program the worker builds. */
      program: TscProgram;
      /** Whether the worker must run at all (false = the program is unchanged). */
      run: boolean;
      /** Absolute paths of the files the worker must lint. */
      lintFiles: string[];
      /** True iff the program key is already recorded green (so `run` is false). */
      skipped: boolean;
      /** Why the program could not be keyed at all, when it could not. */
      unkeyed?: string;
      /** The transcript line saying which incremental base this run starts from. */
      warmBase: string;
      /** What computing the program key cost, rounded. */
      keysMs: number;
    };

/** The worker that came back (a crashed worker has no outcome, and records nothing). */
export interface ProgramOutcome {
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
      /**
       * The record phase, in the order it always ran. Call once, with the
       * worker's outcome — or `undefined` when there is none, because the
       * worker crashed or the program was skipped. Returns the transcript lines
       * the run should log — today the warm-base publish summary, which is the
       * only record step whose result the caller cannot see from anywhere else.
       */
      finalize(outcome: ProgramOutcome | undefined): Promise<string[]>;
    };

const toRel = (root: string, abs: string): string =>
  relative(root, abs).split("\\").join("/");

/**
 * The program's include-expansion — its ROOTS — or the reason there is none.
 *
 * Two things need it: the coverage gate is `lintable − roots`, and half of what
 * the program key says is "which roots is this".
 *
 * A tsconfig that will not parse is its own arm rather than an empty root list,
 * and the difference is load-bearing in both directions. An empty list would
 * make the coverage gate report EVERY lintable file as orphaned — a wall of
 * noise for one broken JSON file — and it would mint a program key for a
 * program we could not describe. The `unparsed` arm instead skips the gate and
 * the key and lets the worker run, where tsc reports the broken config as the
 * one diagnostic it is.
 */
type ProgramRoots =
  { kind: "roots"; roots: string[] } | { kind: "unparsed"; why: string };

function parseProgramRoots(program: TscProgram): ProgramRoots {
  const cfg = ts.readConfigFile(program.tsconfigPath, ts.sys.readFile);
  if (cfg.error) {
    return {
      kind: "unparsed",
      why: ts.flattenDiagnosticMessageText(cfg.error.messageText, " "),
    };
  }
  const parsed = ts.parseJsonConfigFileContent(
    cfg.config,
    ts.sys,
    // The config's own directory: every `include` / `exclude` pattern in it is
    // relative to the file, and the repo tsconfig sits at the repo root.
    join(program.tsconfigPath, ".."),
    undefined,
    program.tsconfigPath,
  );
  return {
    kind: "roots",
    roots: parsed.fileNames.map((f) => ts.sys.resolvePath(f)),
  };
}

/** Prepare one run: the plan, and the session its record phase closes over. */
export function openPreparation({
  listing,
  cacheEnabled,
}: PrepareInput): Preparation {
  const { root } = listing;
  const program = repoProgram(root);

  // Lint universe + per-file closure fingerprints (the warm-path file filter).
  // A FILTER over the listing, never its own walk: that second enumeration is
  // what let a stray `.ts` under gitignored `.cache/` reach the coverage gate
  // and fail a build over content the key never covered.
  const graphs = buildImportGraphs(listing);
  const { perFile } = computeClosureFingerprints(listing, graphs, graphs.files);

  // THE COVERAGE GATE — the load-bearing replacement for projectService's
  // "every file resolves to a project". It used to need a forward-import
  // closure walk from each target's roots, because a file could legitimately be
  // outside every `include` yet reachable from one. Under a blanket include
  // that case is gone: a lintable file that is not a root is by definition
  // outside `include` (a stray `scripts/x.ts` at the repo root), which is
  // exactly what must fail. So the gate is now set subtraction.
  const rootsResult = parseProgramRoots(program);
  if (rootsResult.kind === "roots") {
    const roots = new Set(rootsResult.roots.map((abs) => toRel(root, abs)));
    const uncovered = graphs.files.filter((f) => !roots.has(f));
    if (uncovered.length > 0) return { plan: { kind: "uncovered", uncovered } };
  }

  // Closure cache: lint only files whose import closure changed since the last
  // recorded PASS. tsc still runs regardless.
  const cache = openClosureCache();
  const lintFiles: string[] = [];
  for (const rel of graphs.files) {
    const fp = perFile.get(rel);
    if (fp && cache.has(rel, fp)) continue; // unchanged closure → already linted
    lintFiles.push(join(root, rel));
  }

  // Pick the incremental base: the pooled entry whose recorded file contents
  // best match this tree, or the local base when nothing beats it. That is what
  // makes a FRESH worktree warm — its tree is a main commit's tree, and the base
  // that fits it is the one the last-merged agent published, which "newest wins"
  // evicted within minutes. See `checks/core/warm-base.ts`.
  //
  // ONE memo for the whole run, created here: the scoring hashes most of the
  // files the program key is about to hash, so sharing it both halves the
  // reads and guarantees the two steps saw the same tree.
  const contentHash: ContentHashMemo = new Map();
  const warmBase = materializeWarmBase(root, program.name, contentHash);

  // THE SKIP. An outer-cache MISS rebuilds the program even when the edit
  // cannot have changed it. The program key says "this exact program — these
  // roots, this content, these options — passed before", and a program whose
  // key is already recorded green has nothing left to compute.
  //
  // Computed AFTER `materializeWarmBase`, because the enumeration of the
  // program comes out of the `.tsbuildinfo` on disk: a fresh worktree that
  // just pulled a sibling's base can skip on its very first run.
  //
  // The `lintFiles` clause is load-bearing, and so is its ORDERING. If the
  // per-file closure cache has evicted a file's lint PASS, that file must be
  // re-linted, and only the worker can do it — so a non-empty lint list defeats
  // the skip. Reading it before `lintFiles` was built would silently make that
  // clause always true.
  //
  // `--no-cache` disarms the SKIP but not the RECORD: someone forcing a real
  // run wants the program rebuilt, and the pass it produces is still a
  // perfectly good fact to keep.
  const keyStart = performance.now();
  const keyCtx = openProgramKeyContext(listing, contentHash);
  const passes = openProgramPasses();
  const buildInfoPath = tsBuildInfoPath(root, program.name);
  let key: string | undefined;
  let unkeyed: string | undefined;
  if (rootsResult.kind === "unparsed") {
    unkeyed = `tsconfig did not parse: ${rootsResult.why}`;
  } else {
    const result = programKey(
      keyCtx,
      { tsconfigPath: program.tsconfigPath, buildInfoPath },
      rootsResult.roots,
    );
    if (result.kind === "key") key = result.key;
    else unkeyed = result.why; // no enumeration → cold run, then recorded below
  }
  const skipped =
    key !== undefined &&
    cacheEnabled &&
    passes.has(program.name, key) &&
    lintFiles.length === 0;
  const keysMs = Math.round(performance.now() - keyStart);

  const plan: Extract<Plan, { kind: "run" }> = {
    kind: "run",
    program,
    run: !skipped,
    lintFiles,
    skipped,
    ...(unkeyed !== undefined ? { unkeyed } : {}),
    warmBase: warmBase.line,
    keysMs,
  };

  async function finalize(
    outcome: ProgramOutcome | undefined,
  ): Promise<string[]> {
    // Publish the worker's buildinfo as a warm base for whoever runs next.
    // Publish even when the check FAILED with diagnostics: the buildinfo records
    // program STATE, which is valid regardless of the verdict — a run that found
    // type errors is still a perfectly good incremental base. `outcome` is
    // absent when the worker crashed or never ran, and a crashed worker may
    // have left torn state, so nothing is published then.
    //
    // HEAD is the label that lets the pool's prune recognise this entry later as
    // a commit that reached `main` — the property that decides which base
    // survives for the next fresh worktree. An unavailable HEAD publishes a
    // legacy unlabelled entry and SAYS so in the summary line, rather than
    // dropping the fact on the floor.
    const lines: string[] = [];
    if (outcome) {
      const head = await realGitFacts.headSha(root);
      const p = await publishWarmBase(
        root,
        program.name,
        head.ok ? head.value : undefined,
      );
      lines.push(
        `type-check: published ${p.published ? 1 : 0} warm base ` +
          (head.ok
            ? `labelled ${head.value.slice(0, 12)}`
            : `UNLABELLED (git: ${head.reason})`) +
          (p.protectedOnMain > 0
            ? ` (kept ${p.kept}, ${p.protectedOnMain} on main)`
            : ""),
      );
    }

    // Record per-file lint PASSes for every file we sent that did NOT fail.
    // (Conservative: a crashed worker records nothing — re-lints next time.)
    if (outcome) {
      const failed = new Set(outcome.failedLintFiles);
      for (const abs of lintFiles) {
        if (failed.has(abs)) continue;
        const fp = perFile.get(toRel(root, abs));
        if (fp) cache.record(toRel(root, abs), fp);
      }
    }

    // Record a program PASS when the worker came back completely clean. The key
    // is RECOMPUTED from the buildinfo the worker just WROTE, so what is
    // recorded describes the program that actually passed rather than the one
    // predicted before it ran — on a cold run the two differ, since there was
    // no enumeration to predict from at all.
    //
    // Only a fully-clean run records. A tsc error obviously must not be recorded
    // green; a lint failure need not block a TSC key, but keeping the rule
    // "clean means clean" costs one re-run of a program that was failing anyway
    // and leaves nothing to reason about later.
    if (outcome?.clean && rootsResult.kind === "roots") {
      const result = programKey(
        keyCtx,
        { tsconfigPath: program.tsconfigPath, buildInfoPath },
        rootsResult.roots,
      );
      if (result.kind === "key") passes.record(program.name, result.key);
    }

    // Re-record the key of a SKIPPED program. Not a new claim — it is the
    // identical key that was already green — but the store ages entries out by
    // when they were last WRITTEN, so without this a program that skips
    // successfully every day for a fortnight would be evicted for being unused
    // and pay a cold run. One tiny write turns the age bound into "unused for
    // 14 days", which is what it was always meant to say.
    if (skipped && key !== undefined) passes.record(program.name, key);

    return lines;
  }

  return { plan, finalize };
}
