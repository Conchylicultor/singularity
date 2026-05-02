import type { Command } from "commander";
import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import {
  generateMigration,
  listTrackedMigrationBasenames,
  resolveMainRef,
} from "../migrations";

async function getWorktreeRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return out.trim();
}

// Each migration filename embeds the sha256 prefix of its SQL content
// (see renameMigrations in migrations.ts). If the on-disk content of a
// branch-local migration no longer matches the embedded prefix, the agent
// hand-edited it — and auto-regen would silently discard those edits.
async function assertNoHandEditedBranchLocalMigrations(serverDir: string): Promise<void> {
  const migrationsDir = resolve(serverDir, "src/db/migrations");
  const ref = await resolveMainRef(serverDir);
  if (!ref) {
    console.error(
      "regen-migrations needs `origin/main` or `main` to compare against; run `git fetch origin main` first.",
    );
    process.exit(1);
  }
  const tracked = await listTrackedMigrationBasenames(serverDir, ref);
  const offenders: { file: string; expected: string; actual: string }[] = [];
  for (const f of readdirSync(migrationsDir)) {
    if (!f.endsWith(".sql")) continue;
    if (tracked.has(f)) continue;
    const m = f.match(/^\d{8}_\d{6}_([0-9a-f]{8})__/);
    if (!m) continue;
    const expected = m[1];
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
      const serverDir = resolve(root, "server");
      await assertNoHandEditedBranchLocalMigrations(serverDir);
      await generateMigration({
        serverDir,
        worktreeName: basename(root),
        migrationName: opts.name ?? deriveMigrationName(),
        resetMigration: true,
      });
    });
}
