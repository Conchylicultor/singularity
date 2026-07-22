import type { Command } from "commander";
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import {
  generateMigration,
  listTrackedMigrationBasenames,
  resolveMainRef,
} from "../migrations";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Each migration filename embeds the sha256 prefix of its SQL content
// (see renameMigrations in migrations.ts). If the on-disk content of a
// branch-local migration no longer matches the embedded prefix, the agent
// hand-edited it — and auto-regen would silently discard those edits.
async function assertNoHandEditedBranchLocalMigrations(root: string): Promise<void> {
  const migrationsDir = resolve(root, "plugins/database/plugins/migrations/data");
  const ref = await resolveMainRef(root);
  if (!ref) {
    console.error(
      "regen-migrations needs `origin/main` or `main` to compare against; run `git fetch origin main` first.",
    );
    process.exit(1);
  }
  const tracked = await listTrackedMigrationBasenames(root, ref);
  const offenders: { file: string; expected: string; actual: string }[] = [];
  for (const f of readdirSync(migrationsDir)) {
    if (!f.endsWith(".sql")) continue;
    if (tracked.has(f)) continue;
    // Data migrations (snapshot-less) are exempt: their SQL is hand-written by
    // design and their filename hash is self-healed on every build (see
    // rehashBranchLocalDataMigrations in migrations.ts). Only schema migrations —
    // whose SQL must match the snapshot's DDL — trigger the hand-edit abort.
    if (!existsSync(join(migrationsDir, "meta", `${f.slice(0, -4)}_snapshot.json`)))
      continue;
    const m = f.match(/^\d{8}_\d{6}_([0-9a-f]{8})__/);
    if (!m) continue;
    const expected = m[1]!;
    const sql = readFileSync(join(migrationsDir, f));
    const actual = createHash("sha256").update(sql).digest("hex").slice(0, 8);
    if (expected !== actual) offenders.push({ file: f, expected, actual });
  }
  if (offenders.length === 0) return;
  console.error("Hand-edited migration detected; auto-rebase would discard your edits.\n");
  for (const o of offenders) {
    console.error(`  ${o.file}`);
    console.error(`    filename hash: ${o.expected}`);
    console.error(`    content  hash: ${o.actual}`);
  }
  console.error(
    "\nResolve the rebase manually: either revert the SQL hand-edits and re-run push, " +
      "or rebase by hand and accept the migration files yourself.",
  );
  process.exit(1);
}

function deriveMigrationName(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `merged_${yyyy}${mm}${dd}_${hh}${mi}`;
}

export function registerRegenMigrations(program: Command) {
  program
    .command("regen-migrations")
    .description(
      "Reset branch-local migrations and re-run drizzle-kit generate against the rebased schema. " +
        "Used by the post-rebase normalize step in `push`. Aborts if any branch-local SQL was hand-edited.",
    )
    .option("--name <slug>", "Slug for the regenerated migration (default: merged_YYYYMMDD_HHMM)")
    .action(async (opts: { name?: string }) => {
      const root = await getWorktreeRoot();
      await assertNoHandEditedBranchLocalMigrations(root);
      await generateMigration({
        root,
        worktreeName: basename(root),
        migrationName: opts.name ?? deriveMigrationName(),
        resetMigration: true,
      });
    });
}
