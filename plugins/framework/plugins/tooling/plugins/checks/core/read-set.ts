// Input-keyed invalidation primitive for the `./singularity check` pass-cache.
//
// The whole-tree cache (`cache.ts` `has()/record()`) keys every check's PASS on
// the entire working-tree hash, so ONE changed byte anywhere re-runs all ~62
// checks. This module is the substrate for the alternative: key a PASS on the
// check's ACTUAL inputs, so a tree change that cannot affect a check's verdict
// keeps its cached PASS.
//
// The mental model is NOT "record raw fs syscalls and replay them". It is: a
// check runs against a snapshot-backed `FileSystemView` that LOGS which
// projections of the tree snapshot it consulted (content of a path, existence,
// directory membership, glob/pathspec expansion, grep selection). Validity =
// replaying those projections against the NEXT snapshot and confirming they are
// byte-identical. `git write-tree` (already paid by `computeTreeHash`) has
// hashed every blob; one `git ls-tree -r` turns that into a complete
// content-addressed view of the whole scan surface, from which all four
// projections derive with zero further git calls.
//
// STAGE 0: this file is built but DORMANT — no check sets `inputKeyed`, so the
// runner never takes the input-keyed branch and none of the recording/validate
// paths execute at runtime. Grep instrumentation (recording `queries`) lands in
// a later stage; the `queries`/`glob` projections exist here but are not yet
// exercised.
//
// FAIL-OPEN CONTRACT: the cache must never CAUSE a stale PASS. Any snapshot load
// failure yields `null` (caller runs uncached); `validate` returns a
// discriminated MISS on any doubt (never a false HIT). Recording is best-effort;
// a read-set is only ever CONSUMED through `validate`, which re-derives every
// fact from the fresh snapshot.

import { createHash } from "node:crypto";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------------------------------------------------------------------------
// Recorded read-set (persisted as one JSON per PASS in the evolved check-cache)
// ---------------------------------------------------------------------------

/** A positive content read: the check depends on this path having this content. */
export interface FileFact {
  path: string;
  blobSha: string;
}

/** A directory-membership probe: the check depends on `dir`'s immediate children. */
export interface DirFact {
  dir: string;
  /** Immediate child names (files AND subdirs), sorted. */
  members: string[];
}

/** A glob/pathspec expansion probe: the check depends on this match set. */
export interface GlobFact {
  glob: string;
  /** Matching repo-relative paths, sorted. */
  matches: string[];
}

/**
 * A `git grep -l` selection (Group-A checks). `pathspecFp` fingerprints the
 * `(path, blobSha)` of EVERY file under the query's pathspecs, so a brand-new
 * file that newly matches the grep predicate changes the fingerprint even though
 * none of the previously-matched files changed (hazard H9).
 */
export interface QueryFact {
  grepArg: string;
  fixed: boolean;
  pathspecs: string[];
  /** The selected repo-relative paths, sorted. */
  matches: string[];
  pathspecFp: string;
}

/**
 * The complete set of filesystem facts a check's verdict depended on, recorded
 * against the snapshot the check ran against. A stale PASS is possible iff a
 * verdict-relevant fact is MISSING here — hence completeness is the load-bearing
 * property, enforced structurally (the H0 guard) in a later stage.
 */
export interface ReadSet {
  /**
   * sha256 over the check-system source (see `checkSourceHash`). Editing check
   * logic flips this so a stored PASS never survives a code change.
   */
  sourceHash: string;
  treeHashAtRecord: string;
  recordedAt: number;
  /** Positive content reads. */
  files: FileFact[];
  /** Negative-existence probes (path was absent and the verdict relied on it). */
  absent: string[];
  /** Directory-membership probes. */
  dirs: DirFact[];
  /** Glob/pathspec expansion probes. */
  globs: GlobFact[];
  /** `git grep -l` selections + the new-matcher guard. */
  queries: QueryFact[];
}

// ---------------------------------------------------------------------------
// Snapshot: one `git ls-tree -r` → content-addressed view of the whole tree
// ---------------------------------------------------------------------------

/**
 * A read-only, content-addressed projection of a git tree object. Built ONCE
 * per run (a single `git ls-tree -r -z`) and shared across every check; the
 * `prefix → members` index makes membership / glob / pathspec projections O(1)
 * amortised rather than an O(repo) rescan per query.
 */
export interface TreeSnapshot {
  readonly treeHash: string;
  readonly root: string;
  /** Blob sha of `path`, or null if the path is not a blob in the tree. */
  blobSha(path: string): string | null;
  /** True iff `path` is a blob (file) in the tree. */
  exists(path: string): boolean;
  /** Immediate child names (files + subdirs) of `dir`, sorted; `""` = repo root. */
  members(dir: string): string[];
  /** Repo-relative paths matching the git pathspec `pattern`, sorted. */
  glob(pattern: string): string[];
  /** Union of paths matching ANY of `pathspecs`, sorted. */
  matchPathspecs(pathspecs: string[]): string[];
  /** sha256 over the `(path, blobSha)` of every file under `pathspecs`. */
  pathspecFingerprint(pathspecs: string[]): string;
  /** sha256 over the check-system source blobs (memoised). See `computeCheckSourceHash`. */
  checkSourceHash(): string;
  /** Blob content of `path` as text, or null if absent. One `git cat-file` per call. */
  readBlobText(path: string): Promise<string | null>;
  /** A fresh recording view over this snapshot. */
  createRecordingView(): FileSystemView;
}

async function gitStdout(root: string, args: string[]): Promise<{ code: number; bytes: Uint8Array }> {
  const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  return { code: await proc.exited, bytes };
}

/**
 * Load the tree snapshot for `treeHash`. FAIL-OPEN: returns null if git is
 * unavailable or `ls-tree` fails/looks malformed, so callers degrade to running
 * uncached rather than risking a bogus view.
 */
export async function loadTreeSnapshot(root: string, treeHash: string): Promise<TreeSnapshot | null> {
  try {
    // -z: NUL-terminated records, no path quoting. Each record is
    // `<mode> <type> <sha>\t<path>`; `-r` recurses so only blobs/commits appear.
    const { code, bytes } = await gitStdout(root, ["ls-tree", "-r", "-z", treeHash]);
    if (code !== 0) return null;
    const text = new TextDecoder().decode(bytes);
    const blobSha = new Map<string, string>();
    for (const record of text.split("\0")) {
      if (record.length === 0) continue;
      const tab = record.indexOf("\t");
      if (tab < 0) return null; // framing desync → fail-open
      const meta = record.slice(0, tab);
      const path = record.slice(tab + 1);
      const parts = meta.split(" ");
      const type = parts[1];
      const sha = parts[2];
      if (type !== "blob" || !sha) continue; // skip submodule commits etc.
      blobSha.set(path, sha);
    }
    if (blobSha.size === 0) return null; // an empty tree is never a real scan surface
    return buildSnapshot(root, treeHash, blobSha);
  // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- explicit fail-open contract, mirroring computeTreeHash: any error (no git, spawn failure, malformed output) returns null so checks run uncached; propagating would break the whole run in a degraded environment
  } catch {
    return null;
  }
}

// The check-logic source surface. `checkSourceHash` folds every file under ANY
// of these prefixes (the runner, the shared grep/cache/read-set helpers, every
// check's own `check/` dir, AND the shared parse helpers a grepCode verdict
// depends on) into one hash. Hardcoded because read-set.ts LIVES in the first of
// them, so this list is its own home.
//
// SOUNDNESS (H0 — widened in Stage 1). A grepCode check's verdict is not a pure
// function of the tree bytes it reads: it is `mask/parse(bytes)` where the
// masking/parsing logic lives in `plugin-meta/plugins/parse-utils`
// (`maskSource`, `findImports`, `markerCallSpans`, `lineAt`, …). If that logic
// changes, a previously-masked occurrence can become a real match (or vice
// versa) and the verdict flips WITH NO recorded tree-fact change → a stale PASS.
// So the source hash must cover those helpers too, not just the checks subtree.
//
// We deliberately hash a GENEROUS SUPERSET — the whole `tooling/` tree (the
// runner + every check + all build tooling), all of `parse-utils/`, and all of
// `plugin-tree/` — rather than a precise per-check import closure. A superset is
// strictly SOUND: it can only OVER-invalidate (an unrelated tooling edit re-runs
// a flipped check once), never UNDER-invalidate (which would be the stale PASS).
// These dirs change rarely, so the over-invalidation cost is negligible, and
// covering the whole surface means later stages (which route more helpers through
// the view) inherit coverage with no further widening. `sourceHash` is opaque in
// the stored read-set, so this can still be tightened to a real import closure
// later WITHOUT a read-set format change. Any path under ANY prefix contributes.
//
// `plugin-tree/` (Stage 3, plugin-boundaries). plugin-boundaries' verdict is a
// pure function of the tree bytes it reads AND of `buildPluginTree`'s logic — the
// plugin-position walk + the compositionRoot/package.json marker parsing that
// decide the plugin set. That logic lives in
// `plugins/plugin-meta/plugins/plugin-tree/`, OUTSIDE `tooling/`, so a change to
// it (e.g. how a hollow-shell dir is gated, or how compositionRoot is detected)
// could flip the verdict with NO recorded tree-fact change → a stale PASS. Adding
// the prefix pins it. (Its runtime-facet code path is skipped by boundaries'
// `skipBarrelImport`, but hashing the whole subtree is the sound superset.)
const CHECK_SOURCE_PREFIXES = [
  "plugins/framework/plugins/tooling/",
  "plugins/plugin-meta/plugins/parse-utils/",
  "plugins/plugin-meta/plugins/plugin-tree/",
];

/**
 * sha256 over the sorted `"<path>\0<blobSha>"` of every file under the
 * check-logic prefixes (`CHECK_SOURCE_PREFIXES`: the whole `tooling/` tree plus
 * `parse-utils/`). Any edit to the runner, a shared check helper, an individual
 * check's code, OR the masking/parsing logic a grepCode verdict depends on flips
 * it → a stored PASS keyed on it is invalidated. A thin wrapper over
 * `TreeSnapshot.checkSourceHash()` (which memoises), exposed as a free function
 * so `validate`/tests can name it directly.
 */
export function computeCheckSourceHash(snapshot: TreeSnapshot): string {
  return snapshot.checkSourceHash();
}

function buildSnapshot(root: string, treeHash: string, blobSha: Map<string, string>): TreeSnapshot {
  // Build the `dir → immediate child names` index ONCE. For a/b/c.ts we add
  // c.ts under a/b, b under a, a under "" (root). Files and subdirs both count
  // as members, so a membership probe sees a newly-added file OR subdir.
  const dirMembers = new Map<string, Set<string>>();
  const addMember = (dir: string, name: string) => {
    let set = dirMembers.get(dir);
    if (!set) {
      set = new Set();
      dirMembers.set(dir, set);
    }
    set.add(name);
  };
  for (const path of blobSha.keys()) {
    const segs = path.split("/");
    let dir = "";
    for (let i = 0; i < segs.length; i++) {
      const name = segs[i]!;
      addMember(dir, name);
      dir = dir === "" ? name : `${dir}/${name}`;
    }
  }

  const sortedPaths = [...blobSha.keys()].sort();

  let checkSourceHashMemo: string | undefined;

  const glob = (pattern: string): string[] => {
    const re = pathspecToRegex(pattern);
    return sortedPaths.filter((p) => re.test(p));
  };
  const matchPathspecs = (pathspecs: string[]): string[] => {
    if (pathspecs.length === 0) return [];
    const res = pathspecs.map(pathspecToRegex);
    return sortedPaths.filter((p) => res.some((re) => re.test(p)));
  };

  const snapshot: TreeSnapshot = {
    treeHash,
    root,
    blobSha: (path) => blobSha.get(path) ?? null,
    exists: (path) => blobSha.has(path),
    members: (dir) => {
      const key = dir.replace(/\/+$/, "");
      const set = dirMembers.get(key);
      return set ? [...set].sort() : [];
    },
    glob,
    matchPathspecs,
    pathspecFingerprint: (pathspecs) => {
      const matches = matchPathspecs(pathspecs);
      return sha256(matches.map((p) => `${p}\0${blobSha.get(p) ?? ""}`).join("\n"));
    },
    checkSourceHash: () => {
      if (checkSourceHashMemo === undefined) {
        const parts = sortedPaths
          .filter((p) => CHECK_SOURCE_PREFIXES.some((prefix) => p.startsWith(prefix)))
          .map((p) => `${p}\0${blobSha.get(p)!}`);
        checkSourceHashMemo = sha256(parts.join("\n"));
      }
      return checkSourceHashMemo;
    },
    readBlobText: async (path) => {
      if (!blobSha.has(path)) return null;
      const { code, bytes } = await gitStdout(root, ["cat-file", "blob", `${treeHash}:${path}`]);
      if (code !== 0) return null;
      return new TextDecoder().decode(bytes);
    },
    createRecordingView: () => createRecordingView(snapshot),
  };
  return snapshot;
}

/**
 * Strip a leading git pathspec magic signature so the glob body is left to
 * translate. Long form `:(glob)` / `:(glob,icase)` / `:(top)…`; the trailing `)`
 * closes the group. Short form (`:!`, `:^`) is an EXCLUDE pathspec — not stripped
 * here (no flipped check uses one), so it degrades to the literal-prefix branch,
 * which over-matches (safe). Returns `{ body, glob }` where `glob` is true when
 * the `:(glob)` magic was present (so `*` must NOT span `/`); we ignore that and
 * always let `*` span `/` because OVER-matching is the safe direction.
 */
function stripPathspecMagic(pathspec: string): string {
  if (pathspec.startsWith(":(")) {
    const close = pathspec.indexOf(")");
    if (close >= 0) return pathspec.slice(close + 1);
  }
  return pathspec;
}

/**
 * Translate a git pathspec into a SUPERSET-SAFE regex. Erring toward
 * OVER-matching is the load-bearing invariant: an over-broad match set only
 * causes an unnecessary re-check, never a missed invalidation (a stale PASS).
 * This regex feeds `pathspecFingerprint` — the H9 new-matcher guard — so it MUST
 * be a superset of the true `git grep -l … -- <pathspec>` file set, or a brand-
 * new matching file could slip past unrecorded.
 *
 * Handles: leading git magic (`:(glob)…`, stripped first), `**` and `*` (both
 * mapped to `.*`, spanning `/` — a superset of git-glob's `*` which does not),
 * a double-star followed by a slash (the trailing slash is folded into the `.*`
 * so zero intermediate segments still match — `plugins/[**]/x.ts` matches
 * `plugins/x.ts`), `?` → `.`, and `[…]` char classes. A magic-free pathspec
 * matches itself OR anything under it (git's dir-prefix default).
 */
function pathspecToRegex(pathspec: string): RegExp {
  const body = stripPathspecMagic(pathspec);
  const hasMagic = /[*?[]/.test(body);
  if (hasMagic) {
    let out = "";
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      if (ch === "*") {
        // `**` → `.*` and CONSUME a following `/` so zero intermediate segments
        // still match (superset). A single `*` → `.*` (spans `/`, a superset of
        // git-glob semantics — safe).
        if (body[i + 1] === "*") {
          out += ".*";
          i++;
          if (body[i + 1] === "/") i++;
        } else {
          out += ".*";
        }
      } else if (ch === "?") out += ".";
      else if (ch === "[") {
        const end = body.indexOf("]", i);
        if (end < 0) {
          out += "\\[";
        } else {
          out += body.slice(i, end + 1);
          i = end;
        }
      } else out += ch.replace(/[.+^${}()|\\]/g, "\\$&");
    }
    return new RegExp(`^${out}$`);
  }
  // No magic: a plain path matches itself OR anything under it (dir prefix).
  const dir = body.replace(/\/+$/, "");
  const esc = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}(/.*)?$`);
}

// ---------------------------------------------------------------------------
// Recording view (the single fs seam a check's reads route through)
// ---------------------------------------------------------------------------

/**
 * A snapshot-backed view that RECORDS which projections a check consulted. All
 * reads answer from the snapshot (never the live working tree), so what a check
 * inspects is exactly what the recorded read-set replays against.
 */
export interface FileSystemView {
  /** The scan tree-ish, exposed so `currentScanTree()` reads it off the view. */
  readonly tree: string;
  /** Read a file's content, recording a positive content fact (or an absent probe). */
  readFile(path: string): Promise<string | null>;
  /**
   * Record a positive content fact for `path` WITHOUT reading its bytes — the
   * blobSha is taken from the snapshot. For callers that already have the file's
   * content in hand (e.g. `grepCode`'s BATCH `git cat-file --batch`) and must not
   * regress to a per-file read just to log the dependency. A no-op (records an
   * absent probe) if `path` is not a blob in the snapshot.
   */
  recordFile(path: string): void;
  /** Probe existence, recording a content fact (present) or an absent probe. */
  exists(path: string): boolean;
  /** List a directory's immediate children, recording a membership fact. */
  listDir(dir: string): string[];
  /** Expand a glob/pathspec, recording a glob fact. */
  glob(pattern: string): string[];
  /** Record a `git grep -l` selection + its pathspec fingerprint (Group-A). */
  recordQuery(grepArg: string, fixed: boolean, pathspecs: string[], matches: string[]): void;
  /** Finalise the accumulated, canonicalised read-set. */
  readSet(): ReadSet;
}

function createRecordingView(snapshot: TreeSnapshot): FileSystemView {
  const files = new Map<string, string>(); // path → blobSha
  const absent = new Set<string>();
  const dirs = new Map<string, string[]>(); // dir → members
  const globs = new Map<string, string[]>(); // glob → matches
  const queries: QueryFact[] = [];

  const noteExisting = (path: string) => {
    const sha = snapshot.blobSha(path);
    if (sha === null) absent.add(path);
    else files.set(path, sha);
  };

  return {
    tree: snapshot.treeHash,
    readFile: async (path) => {
      noteExisting(path);
      return snapshot.readBlobText(path);
    },
    recordFile: (path) => {
      noteExisting(path);
    },
    exists: (path) => {
      noteExisting(path);
      return snapshot.exists(path);
    },
    listDir: (dir) => {
      const members = snapshot.members(dir);
      dirs.set(dir.replace(/\/+$/, ""), members);
      return members;
    },
    glob: (pattern) => {
      const matches = snapshot.glob(pattern);
      globs.set(pattern, matches);
      return matches;
    },
    recordQuery: (grepArg, fixed, pathspecs, matches) => {
      queries.push({
        grepArg,
        fixed,
        pathspecs: [...pathspecs].sort(),
        matches: [...matches].sort(),
        pathspecFp: snapshot.pathspecFingerprint(pathspecs),
      });
    },
    readSet: () => canonicalize({
      sourceHash: snapshot.checkSourceHash(),
      treeHashAtRecord: snapshot.treeHash,
      recordedAt: Date.now(),
      files: [...files].map(([path, blobSha]) => ({ path, blobSha })),
      absent: [...absent],
      dirs: [...dirs].map(([dir, members]) => ({ dir, members })),
      globs: [...globs].map(([glob, matches]) => ({ glob, matches })),
      queries,
    }),
  };
}

/** Deterministic ordering so the fingerprint is stable across runs (hazard H7). */
function canonicalize(rs: ReadSet): ReadSet {
  return {
    ...rs,
    files: [...rs.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    absent: [...rs.absent].sort(),
    dirs: [...rs.dirs]
      .map((d) => ({ dir: d.dir, members: [...d.members].sort() }))
      .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0)),
    globs: [...rs.globs]
      .map((g) => ({ glob: g.glob, matches: [...g.matches].sort() }))
      .sort((a, b) => (a.glob < b.glob ? -1 : a.glob > b.glob ? 1 : 0)),
    queries: [...rs.queries]
      .map((q) => ({ ...q, pathspecs: [...q.pathspecs].sort(), matches: [...q.matches].sort() }))
      .sort((a, b) => {
        const ka = `${a.grepArg}\0${a.pathspecs.join(",")}`;
        const kb = `${b.grepArg}\0${b.pathspecs.join(",")}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      }),
  };
}

/**
 * Content-addressed fingerprint of a read-set: sha256 over the canonicalised
 * facts + `sourceHash`. Two read-sets with the same fingerprint depend on an
 * identical set of tree facts. (Not used as the cache lookup key — the read-set
 * is only known AFTER running — but exposed for shadow-mode logging and tests.)
 */
export function fingerprint(readSet: ReadSet): string {
  const c = canonicalize(readSet);
  return sha256(
    JSON.stringify({
      sourceHash: c.sourceHash,
      files: c.files,
      absent: c.absent,
      dirs: c.dirs,
      globs: c.globs,
      queries: c.queries.map((q) => ({ grepArg: q.grepArg, fixed: q.fixed, pathspecs: q.pathspecs, matches: q.matches, pathspecFp: q.pathspecFp })),
    }),
  );
}

// ---------------------------------------------------------------------------
// Validate-by-replay
// ---------------------------------------------------------------------------

/**
 * Discriminated result (never a bare boolean that hides the reason — the reason
 * feeds shadow-mode divergence logging).
 */
export type ValidateResult = { hit: true } | { hit: false; reason: string };

export interface ValidateOptions {
  /**
   * Re-run a recorded `git grep -l` query against the CURRENT scan tree and
   * return its match set. Called ONLY when a query's `pathspecFp` changed
   * (cheap in-memory check first). Absent → a changed pathspecFp is treated as a
   * MISS (safe: run). Wired when grep recording lands (later stage).
   */
  replayQuery?: (query: QueryFact) => Promise<string[]>;
}

function sortedEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/**
 * Replay a recorded read-set against a fresh snapshot. HIT iff EVERY recorded
 * fact still holds; otherwise MISS with a human reason. Any doubt is a MISS —
 * the cache can never CAUSE a stale PASS.
 */
export async function validate(
  readSet: ReadSet,
  snapshot: TreeSnapshot,
  opts?: ValidateOptions,
): Promise<ValidateResult> {
  if (snapshot.checkSourceHash() !== readSet.sourceHash) {
    return { hit: false, reason: "check source changed (sourceHash mismatch)" };
  }
  for (const f of readSet.files) {
    if (snapshot.blobSha(f.path) !== f.blobSha) {
      return { hit: false, reason: `file changed or removed: ${f.path}` };
    }
  }
  for (const path of readSet.absent) {
    if (snapshot.exists(path)) {
      return { hit: false, reason: `previously-absent path now present: ${path}` };
    }
  }
  for (const d of readSet.dirs) {
    if (!sortedEqual(snapshot.members(d.dir), d.members)) {
      return { hit: false, reason: `directory membership changed: ${d.dir}` };
    }
  }
  for (const g of readSet.globs) {
    if (!sortedEqual(snapshot.glob(g.glob), g.matches)) {
      return { hit: false, reason: `glob match set changed: ${g.glob}` };
    }
  }
  for (const q of readSet.queries) {
    if (snapshot.pathspecFingerprint(q.pathspecs) === q.pathspecFp) continue; // provably identical
    if (!opts?.replayQuery) {
      return { hit: false, reason: `query inputs changed (no replay hook): ${q.grepArg}` };
    }
    const fresh = await opts.replayQuery(q);
    if (!sortedEqual(fresh, q.matches)) {
      return { hit: false, reason: `query match set changed: ${q.grepArg}` };
    }
  }
  return { hit: true };
}
