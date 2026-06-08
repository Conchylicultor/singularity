import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, join, relative, resolve } from "path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const PROMPT_RE = /Is .+? (column in .+? table|table|schema|enum|view|sequence|role|policy) created or renamed/;

const DATABASE_CONFIG_PATH = join(SINGULARITY_DIR, "database.json");

function libpqEnv(): Record<string, string> {
  let config: { connection: { host: string; port: number; user: string } };
  try {
    config = JSON.parse(readFileSync(DATABASE_CONFIG_PATH, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT" && !(err instanceof SyntaxError)) throw err;
    config = {
      connection: { host: "localhost", port: 5432, user: process.env.USER ?? "postgres" },
    };
  }
  return {
    PGHOST: process.env.PGHOST ?? config.connection.host,
    PGPORT: process.env.PGPORT ?? String(config.connection.port),
    PGUSER: process.env.PGUSER ?? config.connection.user,
  };
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function listSql(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const check: Check = {
  id: "migrations-in-sync",
  description: "plugin schema files match committed migration files",
  async run() {
    const root = await getRoot();
    const migrationsPluginDir = resolve(root, "plugins/database/plugins/migrations");
    const committed = resolve(migrationsPluginDir, "data");

    const journalPath = join(committed, "meta/_journal.json");
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      const journalTags = new Set(
        (journal.entries as Array<{ tag: string }>).map((e) => e.tag),
      );
      const onDiskTags = listSql(committed).map((f) => f.slice(0, -4));
      const orphans = onDiskTags.filter((tag) => !journalTags.has(tag));
      if (orphans.length > 0) {
        return {
          ok: false,
          message: `Orphan .sql files with no journal entry: ${orphans.join(", ")}`,
          hint: "Either delete the orphan file or regenerate migrations with ./singularity build --migration-name <slug>.",
        };
      }
    }

    const tmp = mkdtempSync(join(migrationsPluginDir, ".check-"));
    try {
      const tmpOut = join(tmp, "migrations");
      cpSync(committed, tmpOut, { recursive: true });

      const tmpConfig = join(tmp, "drizzle.config.ts");
      const realConfig = resolve(migrationsPluginDir, "drizzle.config.ts");
      writeFileSync(
        tmpConfig,
        `import base from ${JSON.stringify(realConfig)};\nexport default { ...base, out: ${JSON.stringify(tmpOut)} };\n`,
      );

      const before = listSql(tmpOut);
      const proc = Bun.spawn(
        [
          process.execPath,
          "x",
          "--bun",
          "drizzle-kit",
          "generate",
          `--config=${relative(migrationsPluginDir, tmpConfig)}`,
        ],
        {
          cwd: migrationsPluginDir,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, ...libpqEnv(), NO_COLOR: "1", SINGULARITY_WORKTREE: basename(root) },
        },
      );
      void proc.stdin.write(new Uint8Array(20).fill(0x0d));
      void proc.stdin.end();

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return {
          ok: false,
          message: `drizzle-kit generate failed:\n${stderr}`,
        };
      }

      if (PROMPT_RE.test(stdout)) {
        return {
          ok: false,
          message:
            "Schema has ambiguous changes (rename vs create) requiring interactive resolution.",
          hint:
            "Run `./singularity build --migration-name <slug>` to see the detected prompts " +
            "and provide explicit --migration-answers.\n\n" +
            "AGENT: Stop here and report this to the user. Do not retry or work around this. " +
            "If this check fails unexpectedly, report the limitation clearly.",
        };
      }

      const after = listSql(tmpOut);
      const added = after.filter((f) => !before.includes(f));
      if (added.length > 0) {
        return {
          ok: false,
          message: `plugin schema files diverge from committed migrations (would add: ${added.join(", ")})`,
          hint: "Run `./singularity build` and commit the generated migration files.",
        };
      }
      return { ok: true };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};

export default check;
