/**
 * Joining the snapshot DAG's tips with a MERGE NODE
 * (research/2026-09-30-global-clone-migrations-published-set.md §3).
 *
 * Merging another `main` into this checkout (an upstream update) forks the
 * snapshot chain at the merge base: user A→U1→U2, upstream A→P1→P2. Both sides
 * are published, hence immutable, so the fork is joined rather than rebased: a
 * migration whose SQL does nothing (each side's own migrations already apply
 * that side's DDL) and whose snapshot is the 3-way merge of the tips against
 * their nearest common ancestor. drizzle-kit's next generate diffs against it,
 * so it emits exactly what the merge resolution itself added and nothing either
 * side already has.
 *
 * The merge node is a pure function of the tips it joins: its snapshot id is
 * derived from the parents and its timestamp from the latest migration on disk.
 * So push's normalize — which resets it as branch-local and runs this again —
 * writes it back byte-identical.
 */
import { createHash } from "crypto";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  analyzeSnapshotDag,
  LOCAL_MAIN_REF,
  migrationContentHash,
  readSnapshotNodes,
  renderMergeSnapshotMigration,
  snapshotAncestors,
  type SnapshotDag,
  type SnapshotNode,
} from "@plugins/database/plugins/migrations/core";
import {
  EMPTY_SNAPSHOT_META,
  formatSnapshotConflict,
  mergeSnapshots,
  type Snapshot,
  type SnapshotConflict,
} from "./snapshot-merge";

const MIGRATION_TS_RE = /^(\d{8})_(\d{6})_[0-9a-f]{8}__.+\.sql$/;

/** The slug every merge node carries. */
export const MERGE_NODE_SLUG = "merge_snapshot";

/** A join that cannot be written. `message` is complete, resolution included. */
export class SnapshotJoinError extends Error {}

export type JoinResult =
  { kind: "single-tip" } | { kind: "joined"; file: string; parents: string[] };

// ─── timestamps ─────────────────────────────────────────────────────────────

function parseTs(ts: string): number {
  return Date.UTC(
    +ts.slice(0, 4),
    +ts.slice(4, 6) - 1,
    +ts.slice(6, 8),
    +ts.slice(9, 11),
    +ts.slice(11, 13),
    +ts.slice(13, 15),
  );
}

/** `YYYYMMDD_HHMMSS` (UTC) — the migration filename timestamp. */
export function formatMigrationTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** The latest timestamp among the migration filenames in `files`, in ms. */
export function latestMigrationTimestamp(
  files: readonly string[],
): number | null {
  let latest: number | null = null;
  for (const f of files) {
    const m = MIGRATION_TS_RE.exec(f);
    if (!m) continue;
    const ms = parseTs(`${m[1]}_${m[2]}`);
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

// ─── the join ───────────────────────────────────────────────────────────────

/** A deterministic snapshot id for the merge of `parents` (uuid-shaped). */
export function mergeSnapshotId(parents: readonly string[]): string {
  const h = createHash("sha256")
    .update(`singularity:merge-snapshot\n${parents.join(",")}`)
    .digest("hex");
  // Version 5-shaped (name-based), RFC 4122 variant.
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function describeProblems(dag: SnapshotDag): string {
  return dag.problems
    .filter((p) => p.kind !== "multiple-tips")
    .map((p) => `  ${JSON.stringify(p)}`)
    .join("\n");
}

/** The nearest common ancestor of two ancestor sets (each including its tip). */
function nearestCommonAncestor(
  dag: SnapshotDag,
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  describe: () => string,
): string {
  const common = [...a].filter((id) => b.has(id));
  // Nearest = not a strict ancestor of another common ancestor.
  const strictAncestorsOfCommon = new Set<string>();
  for (const c of common) {
    for (const x of snapshotAncestors(dag, c))
      if (x !== c) strictAncestorsOfCommon.add(x);
  }
  const nearest = common.filter((c) => !strictAncestorsOfCommon.has(c));
  if (nearest.length !== 1) {
    throw new SnapshotJoinError(
      `cannot join ${describe()}: they have ${nearest.length === 0 ? "no common ancestor" : `${nearest.length} nearest common ancestors (a criss-cross history)`} — a 3-way snapshot merge needs exactly one.\n\n` +
        "AGENT: Stop here and report this to the user verbatim. Never edit, delete or rename a\n" +
        "published migration file.",
    );
  }
  return nearest[0]!;
}

/**
 * Join every tip of the snapshot DAG under `migrationsDir` with one merge node.
 * 0–1 tips is a no-op. `origins` is `publishedMigrationOrigins`: each
 * published basename → the `main` refs holding it. Every tip must be published (the reset already
 * consolidated branch-local ones); a branch-local tip beside a published one is
 * a rebase Y-fork, resolved by `--reset-migration`, never by a merge node.
 *
 * Throws `SnapshotJoinError` — writing nothing — on a branch-local tip, a
 * structurally broken DAG, a missing single common ancestor, or a conflict:
 * both sides changed the same path differently, listed with the resolution.
 */
export async function joinSnapshotTips(
  migrationsDir: string,
  origins: ReadonlyMap<string, readonly string[]>,
): Promise<JoinResult> {
  const nodes = await readSnapshotNodes(migrationsDir);
  const dag = analyzeSnapshotDag(nodes);
  if (dag.tips.length <= 1) return { kind: "single-tip" };

  const tips = dag.tips; // file order
  const other = describeProblems(dag);
  if (other !== "") {
    throw new SnapshotJoinError(
      `the migration snapshot DAG has ${tips.length} tips and is also broken, so they cannot be joined:\n${other}\n` +
        "Run `./singularity check snapshot-chain-intact` for the diagnosis.",
    );
  }
  const published = (t: SnapshotNode) => origins.has(t.file);
  const branchLocal = tips.filter((t) => !published(t));
  if (branchLocal.length > 0) {
    throw new SnapshotJoinError(
      `snapshot chain Y-fork: ${tips.length} tips, and this branch's own migration is one of them:\n` +
        tips
          .map(
            (t) => `  meta/${t.file}${published(t) ? "" : "  (branch-local)"}`,
          )
          .join("\n") +
        "\nRebase onto `main`, then re-run\n" +
        "  ./singularity build --reset-migration --migration-name <slug>\n" +
        "to drop this branch's migration and regenerate it against the new tip.",
    );
  }

  const read = (n: SnapshotNode): Snapshot =>
    JSON.parse(
      readFileSync(join(migrationsDir, "meta", n.file), "utf8"),
    ) as Snapshot;
  const tag = (n: SnapshotNode) => n.file.slice(0, -"_snapshot.json".length);

  // Fold the tips pairwise, local `main`'s tip first: "ours" is always this
  // checkout's trunk, as in git, because the user decides from these labels.
  // The fold order changes only the labels — the merge is symmetric in its
  // two sides and orders keys independently of them, so the node's bytes are
  // the same whichever tip comes first.
  const onTrunk = (t: SnapshotNode) =>
    origins.get(t.file)!.includes(LOCAL_MAIN_REF);
  const trunkKnown = tips.some(onTrunk);
  const side = (t: SnapshotNode) => {
    const refs = origins.get(t.file)!;
    if (!trunkKnown) return `${refs.join(", ")}: ${tag(t)}`;
    return onTrunk(t)
      ? `this checkout (main): ${tag(t)}`
      : `upstream (${refs.join(", ")}): ${tag(t)}`;
  };
  const folded = [...tips.filter(onTrunk), ...tips.filter((t) => !onTrunk(t))];

  let ours = read(folded[0]!);
  let oursAncestors = snapshotAncestors(dag, folded[0]!.id);
  let oursLabel = side(folded[0]!);
  for (const t of folded.slice(1)) {
    const theirsAncestors = snapshotAncestors(dag, t.id);
    const baseId = nearestCommonAncestor(
      dag,
      oursAncestors,
      theirsAncestors,
      () => `${oursLabel} and ${side(t)}`,
    );
    const base = dag.byId.get(baseId)!;
    const result = mergeSnapshots(read(base), ours, read(t));
    if (!result.ok)
      throw conflictError(result.conflicts, oursLabel, side(t), tag(base));
    ours = result.merged;
    oursAncestors = new Set([...oursAncestors, ...theirsAncestors]);
    oursLabel = `the join of ${oursLabel} and ${side(t)}`;
  }

  // Write the node: stamped one second after the latest migration on disk, so
  // it sorts after every existing one (drizzle-kit and the runner both order by
  // filename) and before whatever this run generates (renameMigrations stamps
  // no earlier than that + 1s).
  // Parents in snapshot-file order (never fold order), so the header, the
  // content hash and the derived id do not depend on which side is "ours".
  const parents = tips.map((t) => t.id);
  const latest = latestMigrationTimestamp(readdirSync(migrationsDir));
  const ts = formatMigrationTimestamp((latest ?? Date.now()) + 1000);
  const sql = renderMergeSnapshotMigration(parents);
  const nodeTag = `${ts}_${migrationContentHash(sql)}__${MERGE_NODE_SLUG}`;
  const snapshot: Snapshot = {
    id: mergeSnapshotId(parents),
    // drizzle-kit's single-parent field: the parent that sorts last.
    prevId: tips[tips.length - 1]!.id,
    ...ours,
    _meta: EMPTY_SNAPSHOT_META,
  };
  writeFileSync(join(migrationsDir, `${nodeTag}.sql`), sql);
  writeFileSync(
    join(migrationsDir, "meta", `${nodeTag}_snapshot.json`),
    JSON.stringify(snapshot, null, 2),
  );
  return { kind: "joined", file: `${nodeTag}.sql`, parents };
}

function conflictError(
  conflicts: readonly SnapshotConflict[],
  ours: string,
  theirs: string,
  base: string,
): SnapshotJoinError {
  return new SnapshotJoinError(
    `snapshot merge conflict: both sides changed the same schema path differently.\n` +
      `  ours   = ${ours}\n  theirs = ${theirs}\n  base   = ${base}\n\n` +
      "Each line: <schema path>: ours=<value> theirs=<value> base=<value>\n" +
      conflicts.map((c) => `  ${formatSnapshotConflict(c)}`).join("\n") +
      "\n\nNo merge node was written. Which side's shape wins — and whether data has to move —\n" +
      "is the user's decision; published migrations are immutable, so it can never be made\n" +
      "by editing either side's migration (research/2026-09-30-global-clone-migrations-published-set.md §4).\n\n" +
      "AGENT: Stop here and report this output to the user verbatim. Never delete, rename or\n" +
      "edit a file under plugins/database/plugins/migrations/data to make it pass.",
  );
}
