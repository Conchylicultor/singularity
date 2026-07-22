import { basename, resolve } from "path";
import { schemaGlobFiles } from "@plugins/database/plugins/migrations/core";
import { getWorktreeRoot, spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// Inlined minimal Check shape (mirrors the sibling migration checks) to avoid a
// cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  alwaysRun?: boolean;
  run(): Promise<CheckResult>;
};

const MIGRATIONS_PLUGIN_DIR = "plugins/database/plugins/migrations";

const schemaFilesLoadableCheck: Check = {
  id: "schema-files-loadable",
  description:
    "every drizzle schema-glob file loads synchronously (drizzle-kit require())",
  // Cheap structural invariant: guard even `./singularity build --skip-checks`.
  alwaysRun: true,
  async run() {
    const root = await getWorktreeRoot();
    const absFiles = schemaGlobFiles(root).map((f) => resolve(root, f));

    // One subprocess replicating drizzle-kit's synchronous require() load, run
    // from the migrations plugin dir (matching drizzle-kit's module/tsconfig
    // resolution) with SINGULARITY_WORKTREE set as `migrations-in-sync` does.
    const result = await spawnCaptured(
      [
        process.execPath,
        "--bun",
        resolve(root, MIGRATIONS_PLUGIN_DIR, "check/internal/require-probe.ts"),
        ...absFiles,
      ],
      {
        cwd: resolve(root, MIGRATIONS_PLUGIN_DIR),
        env: { ...process.env, SINGULARITY_WORKTREE: basename(root), NO_COLOR: "1" },
      },
    );
    const stdout = result.stdout;
    const stderr = result.stderr;
    const exitCode = result.exitCode;

    let failures: { file: string; error: string }[];
    try {
      failures = JSON.parse(stdout);
    } catch (parseErr) {
      // The probe couldn't even produce a parseable result — surface loudly,
      // including the parse error and whatever the probe wrote to stderr.
      return {
        ok: false,
        message:
          `schema-files-loadable probe produced unparseable output (${String(parseErr)}).\n` +
          `exit code: ${exitCode}\nstderr:\n${stderr}\nstdout:\n${stdout}`,
      };
    }
    // A non-zero exit with parseable stdout is fine (per-file errors are
    // captured in `failures`); only an unparseable non-zero exit is a probe
    // failure, handled above.
    void exitCode;

    if (failures.length > 0) {
      return {
        ok: false,
        message:
          `${failures.length} schema file(s) cannot be synchronously loaded by drizzle-kit ` +
          `(they would be SILENTLY SKIPPED during migration generation):\n` +
          failures.map((f) => `  ${f.file} — ${f.error}`).join("\n"),
        hint:
          "A schema file's import graph pulls in an async-only module (top-level await, " +
          "e.g. lexical/@lexical/yjs — often reached through a plugin barrel). Keep " +
          "tables.ts/schema.ts a leaf that imports only synchronous modules; move the " +
          "async import out of its graph.",
      };
    }
    return { ok: true };
  },
};

export default schemaFilesLoadableCheck;
