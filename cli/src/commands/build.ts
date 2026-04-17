import type { Command } from "commander";
import { mkdirSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import { homedir } from "os";
import { generateMigration } from "../migrations";
import { generatePluginDocs } from "../docgen";

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

async function databaseExists(name: string): Promise<boolean> {
  const proc = Bun.spawn(
    [
      "psql",
      "-d",
      "postgres",
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${name.replace(/'/g, "''")}'`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`psql failed while checking database "${name}": ${stderr.trim()}`);
    process.exit(1);
  }
  return output.trim() === "1";
}

async function waitForDatabase(name: string): Promise<void> {
  // Conversation creation kicks off `pg_dump | pg_restore` in the background
  // (see plugins/conversations/server/internal/lifecycle.ts). By the time the
  // user runs `./singularity build` in the new worktree the fork is usually
  // done, but poll for a short window to cover the race.
  const deadline = Date.now() + 30_000;
  let warned = false;
  while (Date.now() < deadline) {
    if (await databaseExists(name)) return;
    if (!warned) {
      console.log(`Waiting for DB fork "${name}" to complete...`);
      warned = true;
    }
    await Bun.sleep(1_000);
  }
  console.error(
    `Database "${name}" does not exist. The DB fork either failed or is taking too long — check server logs (the main app also shows a toast on failure).`,
  );
  process.exit(1);
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
    .option("--no-restart", "Skip asking the gateway to restart the backend")
    .action(async (opts: { migrationName?: string; restart: boolean }) => {
      const root = await getWorktreeRoot();
      const name = basename(root);

      if (!NAME_REGEX.test(name)) {
        console.error(
          `Invalid worktree name "${name}". Must match ${NAME_REGEX}`,
        );
        process.exit(1);
      }

      // 0. Ensure the worktree's DB fork has completed (forked asynchronously
      // during conversation creation).
      await waitForDatabase(name);

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

      // 3. Regenerate plugins/CLAUDE.md
      console.log("Generating plugins doc...");
      await generatePluginDocs({ root });

      // 4. Build frontend
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
      if (!opts.restart) {
        console.log(`Deployed to http://${name}.localhost:9000 (restart skipped)`);
        return;
      }
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
