import { cpSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { join, relative, resolve } from "path";
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
  description: "schema.ts matches committed migration files",
  async run() {
    const root = await getRoot();
    const serverDir = resolve(root, "server");
    const committed = resolve(serverDir, "src/db/migrations");

    // Temp dir must live inside the repo so drizzle-kit can resolve a
    // relative --out (it mangles absolute paths) and node_modules.
    const tmp = mkdtempSync(join(serverDir, ".check-"));
    try {
      const tmpOut = join(tmp, "migrations");
      cpSync(committed, tmpOut, { recursive: true });

      const before = listSql(tmpOut);
      const proc = Bun.spawn(
        [
          "bunx",
          "drizzle-kit",
          "generate",
          "--dialect",
          "postgresql",
          "--schema",
          "./src/db/schema.ts",
          "--out",
          relative(serverDir, tmpOut),
        ],
        { cwd: serverDir, stdout: "pipe", stderr: "pipe" },
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
          message: `schema.ts diverges from committed migrations (would add: ${added.join(", ")})`,
          hint: "Run `./singularity build` and commit the generated migration files.",
        };
      }
      return { ok: true };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
