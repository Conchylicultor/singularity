import {
  findPublishedMigrationViolations,
  formatPublishedMigrationViolations,
  PUBLISHED_MIGRATION_HINT,
  publishedMigrationRefsSignature,
} from "@plugins/database/plugins/migrations/core";
import {
  getWorktreeRoot,
  spawnExpectOk,
} from "@plugins/infra/plugins/spawn/core";

// Inlined minimal Check shape (mirrors the sibling checks in this folder) to
// avoid a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null | Promise<string | null>;
};

/**
 * A migration on any `main` this checkout knows of is immutable — every file of
 * it present at `merge-base(HEAD, R)` is still in the working tree,
 * byte-identical, and each published `.sql`'s filename sha8 is its content
 * hash. The rule and its rendering live in the migrations plugin's core, which
 * `regen-migrations` also asserts before push's destructive normalize.
 */
const check: Check = {
  id: "published-migrations-immutable",
  description:
    "no migration published on any main (local or <remote>/main) is deleted, renamed or edited",
  // Impure: the verdict reads the published refs and HEAD (the merge-bases).
  // The working tree CONTENT is covered by the runner's own tree hash.
  async cacheSignature(): Promise<string | null> {
    const root = await getWorktreeRoot();
    const head = await spawnExpectOk(["git", "rev-parse", "HEAD"], {
      cwd: root,
      timeoutMs: 60_000,
    });
    return `HEAD=${head.stdout.trim()};${await publishedMigrationRefsSignature(root)}`;
  },
  async run() {
    const violations = await findPublishedMigrationViolations(
      await getWorktreeRoot(),
    );
    if (violations.length === 0) return { ok: true };
    return {
      ok: false,
      message: `published migration file(s) changed by this branch:\n${formatPublishedMigrationViolations(violations)}`,
      hint: PUBLISHED_MIGRATION_HINT,
    };
  },
};

export default check;
