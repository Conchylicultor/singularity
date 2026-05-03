import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { basename, join, relative, resolve } from "path";
import { libpqEnv } from "../paths";
import type { Check } from "./types";

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

export const migrationsInSync: Check = {
  id: "migrations-in-sync",
  description: "plugin schema files match committed migration files",
  async run() {
    const root = await getRoot();
    const serverDir = resolve(root, "server");
    const committed = resolve(serverDir, "src/db/migrations");

    // Temp dir must live inside the repo so drizzle-kit can resolve
    // node_modules. We write a tmp drizzle config here that points `out` at
    // a tmp migrations dir but reuses the real config's schema globs; then
    // invoke drizzle-kit with `--config` (drizzle-kit 0.28 forbids mixing
    // --config with other CLI flags, so per-flag overrides aren't possible).
    const tmp = mkdtempSync(join(serverDir, ".check-"));
    try {
      const tmpOut = join(tmp, "migrations");
      cpSync(committed, tmpOut, { recursive: true });

      const tmpConfig = join(tmp, "drizzle.config.ts");
      const realConfig = resolve(serverDir, "drizzle.config.ts");
      writeFileSync(
        tmpConfig,
        `import base from ${JSON.stringify(realConfig)};\nexport default { ...base, out: ${JSON.stringify(tmpOut)} };\n`,
      );

      const before = listSql(tmpOut);
      // `--bun` forces Bun runtime; without it, bunx falls back to Node for
      // drizzle-kit's `#!/usr/bin/env node` shebang and crashes when the
      // schema closure pulls in `paths/bins.ts` (Bun.which is undefined).
      const proc = Bun.spawn(
        [
          "bunx",
          "--bun",
          "drizzle-kit",
          "generate",
          `--config=${relative(serverDir, tmpConfig)}`,
        ],
        {
          cwd: serverDir,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, ...libpqEnv(), SINGULARITY_WORKTREE: basename(root) },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return {
          ok: false,
          message: `drizzle-kit generate failed:\n${stderr}`,
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
