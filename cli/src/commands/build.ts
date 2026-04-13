import type { Command } from "commander";
import { mkdirSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import { homedir } from "os";
import { generateMigration } from "../migrations";

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
const WORKTREES_DIR = join(homedir(), ".singularity", "worktrees");

async function exec(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: env ? { ...process.env, ...env } : undefined,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(1);
  }
}

async function getWorktreeRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return output.trim();
}

export function registerBuild(program: Command) {
  program
    .command("build")
    .description(
      "Build the frontend and register the worktree with the gateway",
    )
    .option(
      "--migration-name <slug>",
      "Name for a new migration (required if schema.ts has changed)",
    )
    .action(async (opts: { migrationName?: string }) => {
      const root = await getWorktreeRoot();
      const name = basename(root);

      if (!NAME_REGEX.test(name)) {
        console.error(
          `Invalid worktree name "${name}". Must match ${NAME_REGEX}`,
        );
        process.exit(1);
      }

      // 1. Install dependencies
      console.log("Installing dependencies...");
      await exec(["bun", "install"], root);

      // 2. Regenerate DB migrations from schema.ts
      console.log("Generating DB migrations...");
      await generateMigration({
        serverDir: resolve(root, "server"),
        worktreeName: name,
        migrationName: opts.migrationName,
      });

      // 3. Build frontend
      console.log("Building frontend...");
      await exec(["bun", "run", "build"], resolve(root, "web"));

      // 3. Write registry JSON
      console.log("Registering worktree...");
      const spec = {
        server: resolve(root, "server"),
        web: resolve(root, "web", "dist"),
      };

      mkdirSync(WORKTREES_DIR, { recursive: true });
      writeFileSync(
        join(WORKTREES_DIR, `${name}.json`),
        JSON.stringify(spec, null, 2) + "\n",
      );

      // 4. Restart the backend if the gateway has it running
      console.log("Restarting backend...");
      try {
        const resp = await fetch(
          `http://localhost:9000/gateway/worktrees/${name}/restart`,
          { method: "POST" },
        );
        if (resp.ok) {
          console.log("Backend restarted (will respawn on next request)");
        } else if (resp.status === 404) {
          console.log("No running backend to restart");
        } else {
          console.warn(`Backend restart returned ${resp.status}`);
        }
      } catch {
        // Gateway not running — that's fine, backend will start on first request
        console.log("Gateway not reachable, skipping backend restart");
      }

      console.log(`Deployed to http://${name}.localhost:9000`);
    });
}
