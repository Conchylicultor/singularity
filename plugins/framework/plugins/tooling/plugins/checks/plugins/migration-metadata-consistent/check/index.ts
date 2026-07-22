import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// ---------------------------------------------------------------------------
// Pure classifier (no fs/git) — exported for unit testing.
//
// The migration store is three artifact families keyed by the same <tag>:
//   J = journal tags (meta/_journal.json entries[].tag)
//   S = .sql tags    (data/*.sql, minus .sql)
//   N = snapshot tags (data/meta/*_snapshot.json, minus _snapshot.json)
//
// Invariants asserted:
//   - J === S : every journal entry has a backing .sql, and every .sql has a
//     journal entry. Reported as two diffs:
//       orphanSql     = S \ J  (.sql with no journal entry)
//       orphanJournal = J \ S  (journal entry with no .sql)
//   - N ⊆ J   : every snapshot maps to a real migration:
//       orphanSnapshot = N \ J  (snapshot with no journal entry / no .sql)
//
// Intentionally NOT asserted: J ⊆ N. Data/backfill migrations legitimately
// carry no snapshot (that contract is owned by data-migration-dml-only), so a
// .sql without a snapshot must never be flagged.
// ---------------------------------------------------------------------------
export function classifyMigrationMetadata(
  journalTags: Iterable<string>,
  sqlTags: Iterable<string>,
  snapshotTags: Iterable<string>,
): { orphanSql: string[]; orphanJournal: string[]; orphanSnapshot: string[] } {
  const J = new Set(journalTags);
  const S = new Set(sqlTags);
  const N = new Set(snapshotTags);

  const orphanSql = [...S].filter((t) => !J.has(t)).sort();
  const orphanJournal = [...J].filter((t) => !S.has(t)).sort();
  const orphanSnapshot = [...N].filter((t) => !J.has(t)).sort();

  return { orphanSql, orphanJournal, orphanSnapshot };
}

const check: Check = {
  id: "migration-metadata-consistent",
  description:
    "journal entries, .sql files, and meta snapshots cross-reference each other",
  async run() {
    const root = await getWorktreeRoot();
    const dir = resolve(root, "plugins/database/plugins/migrations/data");
    const metaDir = join(dir, "meta");

    const journal = JSON.parse(readFileSync(join(metaDir, "_journal.json"), "utf8"));
    const journalTags = (journal.entries as Array<{ tag: string }>).map((e) => e.tag);

    const sqlTags = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, -".sql".length));

    const snapshotTags = readdirSync(metaDir)
      .filter((f) => f.endsWith("_snapshot.json"))
      .map((f) => f.slice(0, -"_snapshot.json".length));

    const { orphanSql, orphanJournal, orphanSnapshot } = classifyMigrationMetadata(
      journalTags,
      sqlTags,
      snapshotTags,
    );

    if (orphanSql.length === 0 && orphanJournal.length === 0 && orphanSnapshot.length === 0) {
      return { ok: true };
    }

    const sections: string[] = [];
    if (orphanSql.length > 0) {
      sections.push(
        ".sql files with no journal entry:\n" +
          orphanSql.map((t) => `  ${t}.sql`).join("\n"),
      );
    }
    if (orphanJournal.length > 0) {
      sections.push(
        "journal entries with no .sql file:\n" +
          orphanJournal.map((t) => `  ${t}`).join("\n"),
      );
    }
    if (orphanSnapshot.length > 0) {
      sections.push(
        "meta snapshots with no journal entry / no .sql:\n" +
          orphanSnapshot.map((t) => `  meta/${t}_snapshot.json`).join("\n"),
      );
    }

    return {
      ok: false,
      message:
        "migration metadata is inconsistent (journal ↔ .sql ↔ snapshot must cross-reference):\n" +
        sections.join("\n\n"),
      hint:
        "Migration metadata must stay mutually consistent. For an orphan .sql or " +
        "journal entry, regenerate with `./singularity build --migration-name <slug>` " +
        "(or `./singularity build --reset-migration --migration-name <slug>` to rebuild " +
        "a branch-local migration with a fresh hash). For an orphan snapshot, delete the " +
        "meta/<tag>_snapshot.json and relink the next snapshot's prevId to the deleted " +
        "snapshot's prevId so the chain stays linear (see snapshot-chain-intact).",
    };
  },
};

export default check;
