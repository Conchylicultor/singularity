import { resolve } from "path";
// The DAG's edges (prevId + merge-node parents) and the published set are the
// migrations plugin's: the CLI's tip join reads the same definitions, so this
// check cannot accept a history the generator would refuse, or the reverse.
import {
  analyzeSnapshotDag,
  MIGRATIONS_DATA_DIR,
  NULL_SNAPSHOT_ID,
  publishedMigrationBasenames,
  readSnapshotNodes,
  type SnapshotDagProblem,
} from "@plugins/database/plugins/migrations/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const list = (files: readonly string[]) =>
  files.map((f) => `  meta/${f}`).join("\n");

/**
 * One problem as a message + hint. `published` is only consulted for a
 * multiple-tips fork, to tell a rebase Y-fork from an unjoined upstream merge.
 */
async function explain(
  p: SnapshotDagProblem,
  published: () => Promise<ReadonlySet<string>>,
): Promise<{ message: string; hint: string }> {
  switch (p.kind) {
    case "duplicate-id":
      return {
        message: `duplicate snapshot id ${p.id}:\n${list(p.files)}`,
        hint: "Regenerate one of the snapshots via `./singularity build`.",
      };
    case "missing-parent":
      return {
        message: `snapshot ${p.file} references missing parent ${p.parent}.`,
        hint: "A parent snapshot was deleted or the chain was hand-edited. Restore from git or regenerate.",
      };
    case "merge-prev-not-parent":
      return {
        message: `merge node ${p.file}: its prevId is not one of the parents its .sql header names.`,
        hint: "Merge nodes are generator output — never hand-edit one. Restore it from git, or reset a branch-local one with `./singularity build --reset-migration`.",
      };
    case "no-root":
      return {
        message: `no root snapshot (none has prevId=${NULL_SNAPSHOT_ID}).`,
        hint: "Drizzle snapshots have been corrupted. Regenerate from a known-good state.",
      };
    case "multiple-roots":
      return {
        message: `multiple root snapshots (prevId=${NULL_SNAPSHOT_ID}):\n${list(p.files)}`,
        hint: "Only one snapshot may be the chain root. Rebase onto `main` and re-run `./singularity build`.",
      };
    case "cycle":
      return {
        message: `snapshot parents form a cycle:\n${list(p.files)}`,
        hint: "The chain was hand-edited. Restore the snapshots and merge headers from git.",
      };
    case "unreachable":
      return {
        message: `${p.files.length} snapshot(s) are not reachable from the root:\n${list(p.files)}`,
        hint: "The chain has a broken link. Inspect snapshot prevIds and regenerate if needed.",
      };
    case "multiple-tips": {
      const pub = await published();
      const local = p.files.filter((f) => !pub.has(f));
      const message =
        `snapshot chain has ${p.files.length} tips (a fork no merge node joins):\n` +
        p.files
          .map(
            (f) =>
              `  meta/${f}${pub.has(f) ? "  (published)" : "  (branch-local)"}`,
          )
          .join("\n");
      return local.length > 0
        ? {
            message,
            hint: "A rebase Y-fork: rebase onto `main`, then re-run `./singularity build --reset-migration --migration-name <slug>` to drop this branch's migration and regenerate it against the new tip.",
          }
        : {
            message,
            hint: "Every tip is published — two `main`s were merged (an upstream update). Run `./singularity build`: it writes the merge node that joins them, or stops and names the conflicting schema paths. Never delete or edit a published migration.",
          };
    }
  }
}

const check: Check = {
  id: "snapshot-chain-intact",
  description:
    "drizzle migration snapshots form one DAG (prevId + merge-node parents) with a single root and a single tip",
  async run() {
    const root = await getWorktreeRoot();
    const dag = analyzeSnapshotDag(
      await readSnapshotNodes(resolve(root, MIGRATIONS_DATA_DIR)),
    );
    const first = dag.problems[0];
    if (!first) return { ok: true };
    const { message, hint } = await explain(first, () =>
      publishedMigrationBasenames(root),
    );
    const more = dag.problems.length - 1;
    return {
      ok: false,
      message: more > 0 ? `${message}\n(and ${more} more problem(s))` : message,
      hint,
    };
  },
};

export default check;
