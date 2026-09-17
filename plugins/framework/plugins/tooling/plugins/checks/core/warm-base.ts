/**
 * Host-global warm-base pool for `.tsbuildinfo`: which incremental base a
 * checkout starts its type-check from.
 *
 * `.tsbuildinfo` is a BYPRODUCT of running the type-check, not a tracked
 * output — so the check-result cache (`./cache.ts`) starves it: when main's
 * auto-build hits that cache, `check.run()` never executes and main's local
 * buildinfo is never rewritten. Seeding fresh worktrees from main therefore
 * handed every new worktree an ever-staler base, which is why the pool exists:
 * every run in any worktree publishes, and whoever starts next reads from it.
 *
 * A pool, not a content-addressed store. Keying an artifact on its exact input
 * set only hits when inputs are IDENTICAL — which is precisely when the
 * check-result cache already skips the whole check. An incremental checkpoint
 * earns its value when inputs DIFFER: it is a warm *base*, not an exact output.
 *
 * ## The base is chosen by CONTENT OVERLAP, not by recency
 *
 * The pool used to hand out its NEWEST entry. Agents publish about six entries
 * every ten minutes, so the newest is always some sibling branch, differing
 * from a fresh worktree's tree by 180–360 files — and seeding from it measured
 * the same as starting cold (6–11 GB, 240–600 s for `web-core`, against 2.1 GB
 * and 31 s warm). The base that WOULD fit — the one the last-merged agent
 * published for the tree that became `main`, which is exactly the tree a fresh
 * worktree is created with — was evicted within minutes for being old.
 *
 * So each candidate is SCORED against the tree on disk: how many of the files
 * it recorded still have the same content. tsc records each file's `version`
 * (sha256 of its text) in the buildinfo, and `hashFileCached` hashes the file
 * beside it; equal means tsc will not re-check that file.
 *
 * **Counts, not ratios.** The score is "how many files this base saves", which
 * is the quantity that matters. A ratio would let a tiny program that matches
 * perfectly beat a large one that matches 99 % of ten times as many files.
 *
 * **The resolve-base trap.** A buildinfo's `fileNames` are relative to the
 * buildinfo file's OWN directory. A pool candidate must be scored as if it
 * already sat at this worktree's `.cache/tsbuildinfo/` — resolving against the
 * pool directory yields paths that exist nowhere, so every candidate scores
 * zero and the pool silently looks empty. Hence the explicit `resolveBase`
 * on `readProgramFileList`.
 *
 * A local base already present is replaced only when a pooled one scores
 * STRICTLY higher. That is what makes the rule safe for a worktree iterating
 * in place (its own base always wins) while still fixing the just-rebased case
 * (its base is `main(old) + own delta`; the pool's `main(new)` entry now wins).
 *
 * ## Retention protects the entries that are on `main`
 *
 * Scoring only helps if the entry worth picking is still there. A published
 * base is labelled with its worktree's `HEAD` sha, and the prune keeps the
 * newest `KEEP_PER_TARGET` plus up to `PROTECT_ON_MAIN` further entries whose
 * sha is an ancestor of `main`. A fresh worktree's tree IS a main commit's
 * tree, and the agent whose branch tip became that commit published exactly
 * that base — so "on main" is the property that identifies the entry a fresh
 * worktree wants, and recency is the property that evicted it.
 *
 * "Is an ancestor of main" is MONOTONIC here: `main` is only ever
 * fast-forwarded, so an entry that is protected today stays protected, and a
 * protection decision can never flip back and forth. (That is also what would
 * make a host-global `sha -> true` memo sound, if the `is-ancestor` spawns ever
 * show up in the `finalize <n>s` line. Do not add it before they do.)
 *
 * Relocating a buildinfo verbatim between worktrees is sound: TS writes no
 * absolute paths and validates by content hash, so a worktree's mtime reset is
 * irrelevant. The embedded `version`/`options` mean an incompatible base
 * self-invalidates into a full check — best-effort, never wrong.
 */
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { tsBuildInfoPoolDir } from "../data-dirs";
import { readProgramFileList } from "./buildinfo";
import { hashFileCached, type ContentHashMemo } from "./content-hash";
import { tsBuildInfoPath } from "./discover";
import { realGitFacts, type WarmBaseGitFacts } from "./warm-base-git";

// Keep a few recent bases per (tsVersion, target) so a publish racing a read
// never leaves the pool empty, and age out the rest.
const KEEP_PER_TARGET = 3;
// Plus this many further entries that are on `main` — the ones a fresh
// worktree is actually looking for, which recency alone always evicts.
const PROTECT_ON_MAIN = 6;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** `<ms>-<pid>-<sha12>.tsbuildinfo`; the sha group is what the prune protects on. */
const LABELLED_ENTRY = /^\d+-\d+-([0-9a-f]{7,64})\.tsbuildinfo$/;

/** Not a repo-walk deny-list: it marks which of a buildinfo's OWN paths are scorable. */
const DEPENDENCY_SEGMENT = "/node_modules/";

const require = createRequire(import.meta.url);

let cachedTsVersion: string | null = null;

/**
 * The resolved `typescript` version, read from its package.json rather than by
 * importing the module (module eval is ~1s and this runs on every check).
 *
 * This is a cheap directory PARTITION, not a correctness mechanism — tsc's own
 * embedded `version`/`options` self-validation is what guarantees correctness,
 * so an imperfect partition can only cost a cold run, never a wrong result.
 */
function tsVersion(): string {
  // Memoized: `poolDirFor` runs once per target per operation (8 targets ×
  // materialize+publish), and the resolved compiler cannot change mid-process.
  if (cachedTsVersion === null) {
    const pj = require.resolve("typescript/package.json");
    cachedTsVersion = (
      JSON.parse(readFileSync(pj, "utf8")) as { version: string }
    ).version;
  }
  return cachedTsVersion;
}

function poolDirFor(targetName: string): string {
  return tsBuildInfoPoolDir.file(tsVersion(), targetName);
}

/** Pool entries newest-first. Ids lead with a timestamp, so name order IS recency. */
function listEntries(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".tsbuildinfo"))
    .sort()
    .reverse();
}

/** The entry id as the transcript names it: the filename without its extension. */
function entryId(name: string): string {
  return basename(name, ".tsbuildinfo");
}

/**
 * How well one candidate base fits the tree on disk, or why it could not be
 * judged at all.
 *
 * `skipped` is not a zero score. A torn or vanished candidate tells us
 * nothing, and folding it into "scores zero" would let it lose a tie it never
 * entered — and, worse, would hide a pool that is entirely unreadable behind a
 * line that reads like a legitimately cold start.
 */
type CandidateScore =
  | { kind: "scored"; matched: number; scored: number }
  | { kind: "skipped"; why: string };

/**
 * Count the repo files this base already has the right content for.
 *
 * `node_modules` is left out deliberately: the `version` ⇄ bytes equality
 * verified for repo `.ts`/`.tsx` (utf-8, no BOM) does not carry over to
 * dependency files, whose text tsc may have stripped a `sourceMappingURL`
 * from. Counting them would be counting noise.
 */
function scoreCandidate(
  path: string,
  resolveBase: string,
  memo: ContentHashMemo,
): CandidateScore {
  const listed = readProgramFileList(path, resolveBase);
  if (listed.kind === "absent") return { kind: "skipped", why: "vanished" };
  if (listed.kind === "unreadable") {
    return { kind: "skipped", why: listed.why };
  }
  let matched = 0;
  let scored = 0;
  for (const [i, abs] of listed.files.entries()) {
    const version = listed.versions[i];
    if (version === undefined) continue;
    if (abs.includes(DEPENDENCY_SEGMENT)) continue;
    scored += 1;
    if (hashFileCached(memo, abs) === version) matched += 1;
  }
  return { kind: "scored", matched, scored };
}

/**
 * What `materializeWarmBase` did, for the transcript.
 *
 * Every branch produces a line — cold, seeded, kept, replaced — because the
 * question this whole file answers ("which base did this run start from?") had
 * no answer in any log before, and a silent branch is exactly where a base
 * that scores zero hides.
 */
export interface WarmBaseOutcome {
  target: string;
  /** One greppable transcript line. Always non-empty. */
  line: string;
}

/**
 * Pick this target's incremental base: the pooled entry that best matches the
 * tree on disk, or the local one if nothing beats it. Call before spawning tsc.
 *
 * `memo` is the run's shared content-hash memo — the same one the program keys
 * use — so the thousands of file reads this needs are paid once.
 */
export function materializeWarmBase(
  root: string,
  targetName: string,
  memo: ContentHashMemo,
): WarmBaseOutcome {
  const say = (rest: string): WarmBaseOutcome => ({
    target: targetName,
    line: `type-check: warm base ${targetName}: ${rest}`,
  });

  const localPath = tsBuildInfoPath(root, targetName);
  // Every candidate is judged as if it already sat HERE — see the resolve-base
  // trap in this file's header.
  const resolveBase = dirname(localPath);

  const local = existsSync(localPath)
    ? scoreCandidate(localPath, resolveBase, memo)
    : ({ kind: "skipped", why: "no local base" } as const);

  const dir = poolDirFor(targetName);
  let best: { name: string; matched: number; scored: number } | null = null;
  let skippedEntries = 0;
  // Newest-first, and the comparison is STRICT, so a tie goes to the newer
  // entry for free.
  for (const name of listEntries(dir)) {
    const score = scoreCandidate(join(dir, name), resolveBase, memo);
    if (score.kind === "skipped") {
      skippedEntries += 1;
      continue;
    }
    if (best === null || score.matched > best.matched) {
      best = { name, matched: score.matched, scored: score.scored };
    }
  }

  const torn = skippedEntries > 0 ? `, ${skippedEntries} unreadable` : "";

  if (best === null) {
    if (local.kind === "scored") {
      return say(
        `kept local ${local.matched}/${local.scored} (pool empty${torn})`,
      );
    }
    return say(`cold, pool empty${torn}`);
  }

  if (local.kind === "scored" && local.matched >= best.matched) {
    return say(
      `kept local ${local.matched}/${local.scored} (best pool ${best.matched}${torn})`,
    );
  }

  mkdirSync(resolveBase, { recursive: true });
  try {
    // COPY, never hardlink/symlink: tsc WRITES this file in place, so a link
    // would let one worker's incremental update corrupt the shared pool entry
    // that every other worktree is about to read. Load-bearing.
    copyFileSync(join(dir, best.name), localPath);
  } catch (err) {
    // A concurrent publisher's prune can drop the entry between listing it and
    // copying it. Losing a warm base costs a colder run, never a wrong result
    // — but any other error (permissions, disk) is a real fault and surfaces.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return say(`pool entry ${entryId(best.name)} vanished mid-copy, cold`);
  }

  if (local.kind === "scored") {
    return say(
      `pool ${entryId(best.name)} matched ${best.matched}/${best.scored} files (local ${local.matched}, replaced${torn})`,
    );
  }
  return say(
    `seeded ${best.matched}/${best.scored} from pool ${entryId(best.name)}${torn}`,
  );
}

/** What one target's publish did, for the run's summary line. */
export interface WarmBasePublish {
  /** False when there was no local buildinfo to publish (nothing ran, or tsc died early). */
  published: boolean;
  /** Whether the new entry carries a sha label, i.e. can ever be protected. */
  labelled: boolean;
  /** Entries left in this target's pool after the prune. */
  kept: number;
  /** How many of those are kept ONLY because they are on `main`. */
  protectedOnMain: number;
}

/**
 * Publish this worktree's local buildinfo into the pool, then prune.
 *
 * A no-op (`published: false`) when the local file is absent. Two publishers
 * racing simply produce two entries.
 *
 * `headSha` is the publishing worktree's `HEAD`, read ONCE per run by the
 * caller rather than per target — it is the same answer eight times over, and
 * it is what lets the prune recognise this entry as one of main's later on.
 * `undefined` publishes a legacy unlabelled entry, which works exactly as
 * before but can never be protected; the caller says so in its summary line
 * instead of swallowing it.
 */
export async function publishWarmBase(
  root: string,
  targetName: string,
  headSha: string | undefined,
  git: Pick<WarmBaseGitFacts, "isAncestorOfMain"> = realGitFacts,
): Promise<WarmBasePublish> {
  const localPath = tsBuildInfoPath(root, targetName);
  if (!existsSync(localPath)) {
    return {
      published: false,
      labelled: false,
      kept: 0,
      protectedOnMain: 0,
    };
  }
  if (headSha !== undefined && !/^[0-9a-f]{7,64}$/.test(headSha)) {
    // A caller that has a sha at all got it from `realGitFacts.headSha`, which
    // validates. Anything else is a bug in the caller, not a runtime condition.
    throw new Error(
      `publishWarmBase: headSha is not a commit sha: ${JSON.stringify(headSha)}`,
    );
  }

  const dir = poolDirFor(targetName);
  mkdirSync(dir, { recursive: true });

  // Monotonic + sortable by name, so selection is "newest by name" with no
  // stat storm across entries. The pid disambiguates same-millisecond races,
  // and the sha12 is what the prune protects on.
  const label = headSha === undefined ? "" : `-${headSha.slice(0, 12)}`;
  const publishId = `${Date.now()}-${process.pid}${label}`;
  const tmp = join(dir, `.${publishId}.tmp`);
  copyFileSync(localPath, tmp);
  renameSync(tmp, join(dir, `${publishId}.tsbuildinfo`)); // atomic on the same filesystem

  const pruned = await prune(dir, root, git);
  return { published: true, labelled: headSha !== undefined, ...pruned };
}

/**
 * Age out stale entries, then keep the newest few plus the ones on `main`.
 *
 * Tolerates the readdir/stat race (a concurrent publisher's prune may remove an
 * entry between listing and stat). Also sweeps abandoned `.tmp` files, which a
 * killed publisher leaves behind and which the `.tsbuildinfo` filter hides.
 */
async function prune(
  dir: string,
  root: string,
  git: Pick<WarmBaseGitFacts, "isAncestorOfMain">,
): Promise<{ kept: number; protectedOnMain: number }> {
  const now = Date.now();
  const entries = listEntries(dir);

  // Only entries BEYOND the newest few are ever tested: the newest are kept
  // anyway, so asking git about them would be spawns for an answer nobody uses.
  const candidates = entries.slice(KEEP_PER_TARGET).map((name) => ({
    name,
    sha: LABELLED_ENTRY.exec(name)?.[1],
  }));
  const onMain = await Promise.all(
    candidates.map(async (c): Promise<boolean> => {
      if (c.sha === undefined) return false; // legacy unlabelled: nothing to ask
      const answer = await git.isAncestorOfMain(root, c.sha);
      // `{ ok: false }` means git could not tell us. Not protectable — but not
      // a fault either: the entry simply ages out like any other.
      return answer.ok && answer.value;
    }),
  );
  // In recency order, so the cap keeps the most recent main entries.
  const protectedNames: string[] = [];
  for (const [i, c] of candidates.entries()) {
    if (protectedNames.length >= PROTECT_ON_MAIN) break;
    if (onMain[i] === true) protectedNames.push(c.name);
  }

  const keep = new Set([
    ...entries.slice(0, KEEP_PER_TARGET),
    ...protectedNames,
  ]);
  for (const name of readdirSync(dir)) {
    if (keep.has(name)) continue;
    const path = join(dir, name);
    if (name.endsWith(".tmp")) {
      rmSync(path, { force: true });
      continue;
    }
    // Anything neither recent nor on main is superseded — a hard cap, so the
    // pool is bounded by construction rather than by how often it is swept.
    rmSync(path, { force: true });
  }

  // The count cap alone never empties a target that stopped being built, so age
  // out the survivors too — a base this old is not worth its disk, on main or
  // not.
  let kept = keep.size;
  let protectedKept = protectedNames.length;
  for (const name of keep) {
    const path = join(dir, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      kept -= 1; // entry vanished underneath us — nothing to prune
      if (protectedNames.includes(name)) protectedKept -= 1;
      continue;
    }
    if (now - mtimeMs > MAX_AGE_MS) {
      rmSync(path, { force: true });
      kept -= 1;
      if (protectedNames.includes(name)) protectedKept -= 1;
    }
  }
  return { kept, protectedOnMain: protectedKept };
}
