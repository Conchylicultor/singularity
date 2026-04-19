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
  serverDir: string;
  worktreeName: string;
  migrationName?: string;
}): Promise<void> {
  const { serverDir, worktreeName, migrationName } = opts;

  if (migrationName && !MIGRATION_NAME_REGEX.test(migrationName)) {
    console.error(
      `Invalid --migration-name "${migrationName}". Use lowercase letters, digits, and underscores only.`,
    );
    process.exit(1);
  }

  const migrationsDir = resolve(serverDir, "src/db/migrations");
  const before = new Set(readdirSync(migrationsDir));

  const cmd = ["bunx", "drizzle-kit", "generate"];
  if (migrationName) cmd.push("--name", migrationName);

  const proc = Bun.spawn(cmd, {
    cwd: serverDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "pipe",
    env: { ...process.env, SINGULARITY_WORKTREE: worktreeName },
  });

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
        "If this is a snapshot-chain collision, rebase onto origin/main and re-run ./singularity build.",
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
      "\nError: schema.ts changed and would generate a new migration, " +
        "but --migration-name was not provided.\n" +
        "Re-run with:\n" +
        "  ./singularity build --migration-name <short_slug>\n" +
        "e.g. --migration-name add_todo_status\n",
    );
    process.exit(1);
  }

  const result = renameMigrations(migrationsDir);
  for (const r of result.renamed) {
    console.log(`  ${r.from} → ${r.to}`);
  }
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
