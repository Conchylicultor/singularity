import { createHash } from "crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import { libpqEnv } from "./paths";

const NEW_FORMAT = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
// Drizzle-kit normally numbers files (0000, 0001, …) but emits "0NaN" when
// it can't derive the next index from existing (non-matching) filenames.
const DRIZZLE_FORMAT = /^(\d{4}|0NaN)_(.+)\.sql$/;
const MIGRATION_NAME_REGEX = /^[a-z0-9_]+$/;

/**
 * Run `drizzle-kit generate`; detect whether it produced a new migration;
 * require --migration-name when it did; rename new files to the hash-based
 * format and regenerate the journal. Exits the process on error.
 */
export async function generateMigration(opts: {
  root: string;
  worktreeName: string;
  migrationName?: string;
  resetMigration?: boolean;
  customMigration?: boolean;
}): Promise<void> {
  const { root, worktreeName, migrationName, resetMigration, customMigration } = opts;

  if (migrationName && !MIGRATION_NAME_REGEX.test(migrationName)) {
    console.error(
      `Invalid --migration-name "${migrationName}". Use lowercase letters, digits, and underscores only.`,
    );
    process.exit(1);
  }

  const migrationsDir = resolve(root, "plugins/database/plugins/migrations/data");

  if (resetMigration) {
    await resetBranchLocalMigrations(root, migrationsDir);
  }

  const before = new Set(readdirSync(migrationsDir));

  // `bunx` falls back to Node when the binary's shebang is `#!/usr/bin/env node`
  // (drizzle-kit ships exactly that). Once Node owns the process, transitive
  // imports through plugin barrels can pull in `paths/bins.ts`, which calls
  // `Bun.which()` and crashes with "Bun is not defined" — silently exit-0,
  // no migration generated. `--bun` forces Bun runtime regardless of shebang.
  const cmd = ["bunx", "--bun", "drizzle-kit", "generate"];
  if (customMigration) cmd.push("--custom");
  if (migrationName) cmd.push("--name", migrationName);

  const proc = Bun.spawn(cmd, {
    cwd: resolve(root, "plugins/database/plugins/migrations"),
    // "inherit" would break non-TTY environments: @clack/prompts checks
    // isTTY and aborts when stdin is a pipe, so any interactive "rename
    // table?" prompt drizzle-kit shows would silently exit without generating.
    // "pipe" + a leading \r answers every select-prompt with its default
    // (Enter = accept highlighted choice), which is "create table" — the
    // correct answer when we're replacing a table, not renaming it.
    stdin: "pipe",
    stdout: "inherit",
    stderr: "pipe",
    env: {
      ...process.env,
      ...libpqEnv(),
      SINGULARITY_WORKTREE: worktreeName,
    },
  });
  // Send Enter to auto-accept the default answer on any select prompt.
  proc.stdin.write(new Uint8Array([0x0d]));
  proc.stdin.end();

  // Tee stderr: forward live to the user AND capture so we can detect cases
  // where drizzle-kit printed a diagnostic but still exited 0 (seen with
  // snapshot-chain collisions).
  let stderrBuf = "";
  const stderrDone = (async () => {
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stderr.write(value);
      stderrBuf += decoder.decode(value, { stream: true });
    }
    stderrBuf += decoder.decode();
  })();

  const exitCode = await proc.exited;
  await stderrDone;
  if (exitCode !== 0) process.exit(1);
  if (/\b(error|collision|conflict)\b/i.test(stderrBuf)) {
    console.error(
      "\nError: drizzle-kit printed a diagnostic but exited 0. Treating as failure.\n" +
        "If this is a snapshot-chain collision, rebase onto origin/main, then re-run\n" +
        "  ./singularity build --reset-migration --migration-name <slug>\n" +
        "to drop this branch's migration and regenerate it against the new tip.",
    );
    process.exit(1);
  }

  const added = readdirSync(migrationsDir).filter(
    (f: string) => f.endsWith(".sql") && !before.has(f),
  );

  if (added.length === 0) {
    if (migrationName) {
      console.warn(
        "--migration-name was provided but no schema change was detected; ignoring.",
      );
    }
    return;
  }

  if (!migrationName) {
    removeGeneratedFiles(migrationsDir, added);
    console.error(
      "\nError: DB schema change detected — a new migration is required, but --migration-name was not provided.\n" +
        "\n" +
        "Re-run with:\n" +
        "  ./singularity build --migration-name <short_slug>\n" +
        "\n" +
        "Examples:\n" +
        "  --migration-name add_task_priority      (added a column/table)\n" +
        "  --migration-name remove_yak_shaving     (removed a plugin's tables)\n" +
        "\n" +
        "If you removed a plugin or table: this is expected — drizzle generates a DROP TABLE\n" +
        "migration automatically. Do NOT delete migration files or snapshots by hand;\n" +
        "that breaks the snapshot chain for every other agent.\n",
    );
    process.exit(1);
  }

  const result = renameMigrations(migrationsDir);
  for (const r of result.renamed) {
    console.log(`  ${r.from} → ${r.to}`);
  }
}

/**
 * Delete migration files that exist in the working tree but not at
 * `origin/main` (or local `main` as fallback). Used by `--reset-migration`
 * to recover from a snapshot-chain Y-fork after rebasing onto main: the
 * branch-local migration is dropped so drizzle-kit can re-emit a fresh one
 * against the rebased tip.
 *
 * Only ever touches files absent from the chosen ref, so a shared migration
 * cannot be removed by accident. After deletion, regenerates the journal so
 * drizzle-kit's "latest snapshot" lookup matches what's left on disk.
 */
async function resetBranchLocalMigrations(
  root: string,
  migrationsDir: string,
): Promise<void> {
  const ref = await resolveRef(root);
  if (!ref) {
    console.error(
      "--reset-migration needs `origin/main` or `main` to compare against; run `git fetch origin main` first.",
    );
    process.exit(1);
  }

  const tracked = await listTrackedMigrationBasenames(root, ref);
  const metaDir = join(migrationsDir, "meta");

  const removed: string[] = [];
  for (const f of readdirSync(migrationsDir)) {
    if (!f.endsWith(".sql")) continue;
    if (tracked.has(f)) continue;
    rmSync(join(migrationsDir, f), { force: true });
    removed.push(f);
  }
  for (const f of readdirSync(metaDir)) {
    if (!f.endsWith("_snapshot.json")) continue;
    if (tracked.has(f)) continue;
    rmSync(join(metaDir, f), { force: true });
    removed.push(`meta/${f}`);
  }

  if (removed.length === 0) {
    console.log(
      "(--reset-migration: no branch-local migrations found, nothing to reset)",
    );
    return;
  }

  for (const f of removed) console.log(`  removed ${f}`);
  // Rewrite _journal.json so it matches the (now reduced) set of .sql files
  // on disk. Drizzle reads journal entries to pick the "latest snapshot"
  // when generating; a stale entry pointing at a just-deleted file would
  // make it skip our reset.
  regenerateJournal(migrationsDir);
}

async function resolveRef(root: string): Promise<string | null> {
  for (const ref of ["origin/main", "main"]) {
    const proc = Bun.spawn(["git", "rev-parse", "--verify", ref], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) === 0) return ref;
  }
  return null;
}

export async function resolveMainRef(root: string): Promise<string | null> {
  return resolveRef(root);
}

export async function listTrackedMigrationBasenames(
  root: string,
  ref: string,
): Promise<Set<string>> {
  const proc = Bun.spawn(
    [
      "git",
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      "plugins/database/plugins/migrations/data",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return new Set();
  return new Set(
    out
      .split("\n")
      .filter(Boolean)
      .map((p) => p.split("/").pop() ?? p),
  );
}

export interface RenameResult {
  renamed: Array<{ from: string; to: string; hash: string }>;
}

export function renameMigrations(migrationsDir: string): RenameResult {
  const metaDir = join(migrationsDir, "meta");
  const renamed: RenameResult["renamed"] = [];

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (NEW_FORMAT.test(file)) continue;
    const m = DRIZZLE_FORMAT.exec(file);
    if (!m) continue;
    const [, idx, name] = m;

    const sqlPath = join(migrationsDir, file);
    const sql = readFileSync(sqlPath, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 8);
    const ts = timestampNow();
    const newName = `${ts}_${hash}__${name}.sql`;

    renameSync(sqlPath, join(migrationsDir, newName));

    const oldSnap = join(metaDir, `${idx}_snapshot.json`);
    const newSnap = join(metaDir, `${ts}_${hash}__${name}_snapshot.json`);
    if (existsSync(oldSnap)) renameSync(oldSnap, newSnap);

    renamed.push({ from: file, to: newName, hash });
  }

  regenerateJournal(migrationsDir);
  return { renamed };
}

export function removeGeneratedFiles(
  migrationsDir: string,
  files: string[],
): void {
  const metaDir = join(migrationsDir, "meta");
  for (const f of files) {
    if (!f.endsWith(".sql")) continue;
    rmSync(join(migrationsDir, f), { force: true });
    // Drizzle snapshot name is <prefix>_snapshot.json where <prefix> is the
    // filename up to the first underscore (the NNNN or 0NaN token).
    const idxMatch = /^([^_]+)_/.exec(f);
    if (idxMatch) {
      rmSync(join(metaDir, `${idxMatch[1]}_snapshot.json`), { force: true });
    }
  }
}

function timestampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function regenerateJournal(migrationsDir: string): void {
  const metaDir = join(migrationsDir, "meta");
  const files = readdirSync(migrationsDir)
    .filter((f: string) => NEW_FORMAT.test(f))
    .sort();

  const entries = files.map((f: string) => {
    const m = NEW_FORMAT.exec(f);
    if (!m) throw new Error(`unreachable: ${f}`);
    const [, date, time, hash] = m;
    const when = Date.UTC(
      +date.slice(0, 4),
      +date.slice(4, 6) - 1,
      +date.slice(6, 8),
      +time.slice(0, 2),
      +time.slice(2, 4),
      +time.slice(4, 6),
    );
    return {
      version: "7",
      when,
      tag: f.slice(0, -4),
      hash,
      breakpoints: true,
    };
  });

  writeFileSync(
    join(metaDir, "_journal.json"),
    JSON.stringify(
      { version: "7", dialect: "postgresql", entries },
      null,
      2,
    ) + "\n",
  );
}
