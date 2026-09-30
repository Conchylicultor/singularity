/**
 * The drizzle snapshot DAG — one definition of its edges, read by the CLI's
 * generate pipeline (which joins tips with a merge node and stages drizzle-kit's
 * view of it) and by the `snapshot-chain-intact` / `migrations-in-sync` checks.
 *
 * Every schema migration carries `meta/<tag>_snapshot.json`. A snapshot's parent
 * is its `prevId`, except a MERGE NODE's, whose parents are the snapshot ids its
 * `.sql` header names (`mergeSnapshotParents`, `./phases`). A healthy history is
 * a DAG with exactly one root and exactly one tip: a checkout that merged
 * another `main` (an upstream update) forks at the merge base and re-joins at
 * the merge node. See research/2026-09-30-global-clone-migrations-published-set.md §3.
 */
import { open, readdir } from "fs/promises";
import { join } from "path";
import { mergeSnapshotParents } from "./phases";

/** drizzle's `prevId` of the first snapshot. */
export const NULL_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000000";

/** One snapshot, as far as the DAG is concerned. */
export interface SnapshotNode {
  /** The snapshot basename: `<tag>_snapshot.json`. */
  file: string;
  id: string;
  prevId: string;
  /** The merge header's parents when the sibling `.sql` is a merge node. */
  mergeParents: readonly string[] | null;
}

/** Why a set of snapshots is not a single-root, single-tip DAG. */
export type SnapshotDagProblem =
  | { kind: "duplicate-id"; id: string; files: string[] }
  | { kind: "missing-parent"; file: string; parent: string }
  | { kind: "merge-prev-not-parent"; file: string }
  | { kind: "no-root" }
  | { kind: "multiple-roots"; files: string[] }
  | { kind: "cycle"; files: string[] }
  | { kind: "unreachable"; files: string[] }
  | { kind: "multiple-tips"; files: string[] };

export interface SnapshotDag {
  byId: ReadonlyMap<string, SnapshotNode>;
  /** Parent ids of a node (only those present). */
  parentsOf(id: string): readonly string[];
  roots: readonly SnapshotNode[];
  /** Nodes no other node names as a parent, in file order. */
  tips: readonly SnapshotNode[];
  /** Every structural problem, `multiple-tips` included. */
  problems: readonly SnapshotDagProblem[];
}

/** A node's declared parent ids: the merge header's, else its `prevId`. */
export function declaredParents(n: SnapshotNode): readonly string[] {
  if (n.mergeParents) return n.mergeParents;
  return n.prevId === NULL_SNAPSHOT_ID ? [] : [n.prevId];
}

/** PURE: the DAG over `nodes`, and everything wrong with it. */
export function analyzeSnapshotDag(
  nodes: readonly SnapshotNode[],
): SnapshotDag {
  const sorted = [...nodes].sort((a, b) => a.file.localeCompare(b.file));
  const problems: SnapshotDagProblem[] = [];

  const byId = new Map<string, SnapshotNode>();
  const dupes = new Map<string, string[]>();
  for (const n of sorted) {
    const prior = byId.get(n.id);
    if (prior) {
      const files = dupes.get(n.id) ?? [prior.file];
      files.push(n.file);
      dupes.set(n.id, files);
      continue;
    }
    byId.set(n.id, n);
  }
  for (const [id, files] of dupes)
    problems.push({ kind: "duplicate-id", id, files });

  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const n of byId.values()) {
    if (n.mergeParents && !n.mergeParents.includes(n.prevId))
      problems.push({ kind: "merge-prev-not-parent", file: n.file });
    const present: string[] = [];
    for (const p of declaredParents(n)) {
      if (!byId.has(p)) {
        problems.push({ kind: "missing-parent", file: n.file, parent: p });
        continue;
      }
      if (present.includes(p)) continue;
      present.push(p);
      const list = children.get(p) ?? [];
      list.push(n.id);
      children.set(p, list);
    }
    parents.set(n.id, present);
  }

  const all = [...byId.values()];
  const roots = all.filter((n) => declaredParents(n).length === 0);
  const tips = all.filter((n) => !children.has(n.id));
  if (all.length > 0 && roots.length === 0) problems.push({ kind: "no-root" });
  if (roots.length > 1)
    problems.push({ kind: "multiple-roots", files: roots.map((r) => r.file) });

  // Kahn's order: whatever it cannot reach sits on (or behind) a cycle.
  const indegree = new Map(all.map((n) => [n.id, parents.get(n.id)!.length]));
  const queue = all.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const ordered = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.add(id);
    for (const c of children.get(id) ?? []) {
      const d = indegree.get(c)! - 1;
      indegree.set(c, d);
      if (d === 0) queue.push(c);
    }
  }
  const cyclic = all.filter((n) => !ordered.has(n.id));
  if (cyclic.length > 0)
    problems.push({ kind: "cycle", files: cyclic.map((n) => n.file) });

  // With one root, every node must descend from it. (Several roots are
  // already a problem of their own; reachability from each adds nothing.)
  if (roots.length === 1 && cyclic.length === 0) {
    const reached = new Set<string>([roots[0]!.id]);
    const stack = [roots[0]!.id];
    while (stack.length > 0) {
      for (const c of children.get(stack.pop()!) ?? []) {
        if (reached.has(c)) continue;
        reached.add(c);
        stack.push(c);
      }
    }
    const unreachable = all.filter((n) => !reached.has(n.id));
    if (unreachable.length > 0)
      problems.push({
        kind: "unreachable",
        files: unreachable.map((n) => n.file),
      });
  }

  // In a finite acyclic graph every node reaches some tip, so one tip means
  // every node reaches it.
  if (tips.length > 1)
    problems.push({ kind: "multiple-tips", files: tips.map((t) => t.file) });

  return {
    byId,
    parentsOf: (id) => parents.get(id) ?? [],
    roots,
    tips,
    problems,
  };
}

/** PURE: `id` and every node it descends from. */
export function snapshotAncestors(dag: SnapshotDag, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    for (const p of dag.parentsOf(stack.pop()!)) {
      if (seen.has(p)) continue;
      seen.add(p);
      stack.push(p);
    }
  }
  return seen;
}

/**
 * How much of a file's start is read. drizzle-kit writes `id` then `prevId` as
 * a snapshot's first two keys, and a merge node's header is its `.sql`'s first
 * line — both fit well inside this.
 */
const HEAD_BYTES = 1024;

/** The first two keys of a snapshot, anchored at the start of the file. */
const HEAD_RE = /^\{\s*"id":\s*"([^"]+)",\s*"prevId":\s*"([^"]+)"/;

async function readStart(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0);
    return buf.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Every snapshot in `<dataDir>/meta` as a DAG node. A snapshot is the whole
 * schema (~250 KB, hundreds of them), so only the start of each file — and of
 * its sibling `.sql`, for a merge header — is read. A snapshot whose start is
 * not `{ "id": …, "prevId": … }` throws, naming it: a changed drizzle layout
 * must fail here, not pass unchecked. A snapshot with no sibling `.sql` has no
 * merge parents (`migration-metadata-consistent` owns that orphan).
 */
export async function readSnapshotNodes(
  dataDir: string,
): Promise<SnapshotNode[]> {
  const metaDir = join(dataDir, "meta");
  const files = (await readdir(metaDir))
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const path = join(metaDir, file);
      const match = HEAD_RE.exec((await readStart(path)) ?? "");
      if (!match) {
        throw new Error(
          `${path} does not start with "id" then "prevId" — the drizzle snapshot layout changed; update readSnapshotNodes`,
        );
      }
      const sql = await readStart(
        join(dataDir, `${file.slice(0, -"_snapshot.json".length)}.sql`),
      );
      return {
        file,
        id: match[1]!,
        prevId: match[2]!,
        mergeParents: sql === null ? null : mergeSnapshotParents(sql),
      };
    }),
  );
}
