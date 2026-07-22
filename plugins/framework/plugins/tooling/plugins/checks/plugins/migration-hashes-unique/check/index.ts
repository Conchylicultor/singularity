import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { getWorktreeRoot, spawnCaptured } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// <ts>_<sha8>__<slug>.sql — the runner (server/internal/runner.ts) keys applied
// state by the sha8 hash token, which is the PRIMARY KEY of __singularity_migrations.
const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
const MIGRATIONS_SUBDIR = "plugins/database/plugins/migrations/data";

// ---------------------------------------------------------------------------
// Pure classifier (no fs/git) — exported for unit testing.
//
// Each sha8 group with >1 file is classified by reading the actual file
// CONTENTS (sha8 is derived from content, so true collisions are byte-identical;
// differing content is the theoretical ~1-in-4-billion case):
//
//   - all files byte-identical            -> FLAG (byte-identical): the runner
//        applies the first by timestamp and skips the rest, and the hash is
//        already in every deployed ledger, so deleting the redundant file(s) is
//        a pure runtime no-op. Flagged regardless of tracked status.
//   - else, some file is branch-local     -> FLAG (differing-branch-local):
//        distinct content that can be regenerated with a fresh hash.
//   - else (all tracked, differing)       -> exempt: a true sha8 collision on
//        frozen history that can never be rehashed (the safety valve).
// ---------------------------------------------------------------------------
export type MigrationFile = { name: string; content: string; tracked: boolean };
export type MigrationGroup = { hash: string; files: MigrationFile[] };
export type CollisionKind = "byte-identical" | "differing-branch-local";
export type FlaggedCollision = { hash: string; files: string[]; kind: CollisionKind };

export function classifyCollisions(groups: MigrationGroup[]): FlaggedCollision[] {
  const flagged: FlaggedCollision[] = [];
  for (const { hash, files } of groups) {
    if (files.length <= 1) continue;
    const allIdentical = files.every((f) => f.content === files[0]!.content);
    if (allIdentical) {
      flagged.push({ hash, files: files.map((f) => f.name), kind: "byte-identical" });
    } else if (files.some((f) => !f.tracked)) {
      flagged.push({ hash, files: files.map((f) => f.name), kind: "differing-branch-local" });
    }
    // else: all tracked, differing content -> exempt (frozen true collision).
  }
  return flagged;
}

async function git(root: string, args: string[]): Promise<{ code: number; out: string }> {
  const result = await spawnCaptured(["git", ...args], { cwd: root });
  return { code: result.exitCode, out: result.stdout };
}

// Basenames present on origin/main (or local main). A file tracked there is
// immutable: its hash is recorded in every deployed DB's __singularity_migrations
// and can never be rehashed. This gates only the *differing-content* exemption —
// byte-identical duplicates are always flagged (they are safely removable), so a
// frozen true sha8 collision (differing content, all tracked) is the lone case we
// still tolerate, since flagging it would make this check impossible to satisfy.
async function trackedBasenames(root: string): Promise<Set<string>> {
  for (const ref of ["origin/main", "main"]) {
    if ((await git(root, ["rev-parse", "--verify", ref])).code !== 0) continue;
    const { out } = await git(root, [
      "ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_SUBDIR,
    ]);
    return new Set(out.split("\n").filter(Boolean).map((p) => p.split("/").pop()!));
  }
  return new Set();
}

const fmtGroups = (cols: FlaggedCollision[]): string =>
  cols
    .map((c) => `  ${c.hash}:\n${c.files.map((f) => `    ${f}`).join("\n")}`)
    .join("\n");

const check: Check = {
  id: "migration-hashes-unique",
  description:
    "every migration filename carries a distinct sha8 (the runner's applied-state key)",
  // Not a pure function of the working tree: trackedBasenames() reads
  // origin/main / main via git ls-tree, so the result can change while the tree
  // is byte-identical. Never cache.
  cacheSignature: () => null,
  async run() {
    const root = await getWorktreeRoot();
    const dir = resolve(root, MIGRATIONS_SUBDIR);
    const tracked = await trackedBasenames(root);

    // Group filenames by sha8. Read content only for collision groups (>1 file):
    // that is all the classifier needs to test byte-identicality.
    const namesByHash = new Map<string, string[]>();
    for (const f of readdirSync(dir)) {
      const m = MIGRATION_RE.exec(f);
      if (!m) continue;
      const list = namesByHash.get(m[3]!) ?? [];
      list.push(f);
      namesByHash.set(m[3]!, list);
    }

    const groups: MigrationGroup[] = [...namesByHash.entries()].map(([hash, names]) => ({
      hash,
      files: names.map((name) => ({
        name,
        content: names.length > 1 ? readFileSync(join(dir, name), "utf8") : "",
        tracked: tracked.has(name),
      })),
    }));

    const flagged = classifyCollisions(groups);
    if (flagged.length === 0) return { ok: true };

    const identical = flagged.filter((c) => c.kind === "byte-identical");
    const branchLocal = flagged.filter((c) => c.kind === "differing-branch-local");

    const messageParts: string[] = [];
    const hintParts: string[] = [];

    if (identical.length > 0) {
      messageParts.push(
        "byte-identical duplicate migrations (same sha8, identical content — the runner " +
          "applies the first by timestamp and skips the rest):\n" +
          fmtGroups(identical),
      );
      hintParts.push(
        "Byte-identical duplicates are safely removable: keep the earliest-timestamp file " +
          "(canonical) and delete the rest. For each removed file also delete its " +
          "meta/<tag>_snapshot.json, remove its _journal.json entry, and relink the next " +
          "snapshot's prevId to the removed file's prevId. This is a runtime no-op — the " +
          "runner already applied the first and the hash is recorded in every deployed " +
          "__singularity_migrations ledger.",
      );
    }

    if (branchLocal.length > 0) {
      messageParts.push(
        "branch-local migration filename hash collision (differing content that would never " +
          "run — the runner applies the first and skips the rest):\n" +
          fmtGroups(branchLocal),
      );
      hintParts.push(
        "Each migration's sha8 must be unique. Custom/backfill migrations once all hashed to " +
          "the empty drizzle placeholder (b3cc75fa); renameMigrations now uniquifies the body " +
          "at generate time. Rebase onto origin/main and re-run `./singularity build " +
          "--reset-migration --migration-name <slug>` to regenerate the branch-local migration " +
          "with a distinct hash.",
      );
    }

    return {
      ok: false,
      message: messageParts.join("\n\n"),
      hint: hintParts.join("\n\n"),
    };
  },
};

export default check;
