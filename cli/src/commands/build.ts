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

async function getCurrentBranch(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("Could not determine current branch");
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

async function probeHealth(name: string): Promise<void> {
  console.log("Probing /api/health...");
  const url = `http://${name}.localhost:9000/api/health`;
  const deadline = Date.now() + 10_000;
  let lastStatus: number | string = "no response";
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
      lastStatus = resp.status;
    } catch (err) {
      lastStatus = err instanceof Error ? err.message : String(err);
    }
    await Bun.sleep(250);
  }
  console.error(
    `Server failed to respond on /api/health within 10s (last: ${lastStatus}).`,
  );
  console.error(
    "The build artifacts are valid but the server can't boot. Check server logs.",
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
    .option(
      "--allow-main",
      "DANGER: allow running build from the main branch. Agents MUST NOT pass this flag without explicit user approval in the current conversation.",
    )
    .action(async (opts: { migrationName?: string; restart: boolean; allowMain?: boolean }) => {
      const branch = await getCurrentBranch();
      if (branch === "main" && !opts.allowMain) {
        console.error(
          [
            "ERROR: refusing to build from the main branch.",
            "",
            "Agents should work in a worktree, not directly on main.",
            "If you are inside a worktree conversation, make sure you are running",
            "this command from the worktree directory, not the main repo.",
            "",
            "To override (only with explicit user permission): ./singularity build --allow-main",
          ].join("\n"),
        );
        process.exit(1);
      }

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

      // 4. Type-check server. Bun runs the server without static checks, and
      // the web `tsc -b` only covers files reachable from web — so server-only
      // modules (handlers, pollers) can ship with broken imports and only
      // surface as 502s on first request. Run server tsc explicitly here.
      console.log("Type-checking server...");
      await exec(["bunx", "tsc"], resolve(root, "server"));

      // 5. Build frontend
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
      let gatewayUp = true;
      let backendWasRunning = false;
      try {
        const resp = await fetch(
          `http://localhost:9000/gateway/worktrees/${name}/restart`,
          { method: "POST" },
        );
        if (resp.ok) {
          backendWasRunning = true;
          console.log("Backend restarted (will respawn on next request)");
        } else if (resp.status === 404) {
          console.log("No running backend to restart");
        } else {
          console.warn(`Backend restart returned ${resp.status}`);
        }
      } catch {
        // Gateway not running — that's fine, backend will start on first request
        gatewayUp = false;
        console.log("Gateway not reachable, skipping backend restart");
      }

      // Smoke-test the server boot. tsc catches static import errors but the
      // server can still fail to evaluate (missing env, init-time cycle, etc.)
      // and surface as a 502 on first request. Hit /api/health to force a boot
      // and fail the build if the server can't come up.
      if (gatewayUp && backendWasRunning) {
        await probeHealth(name);
      }

      console.log(`Deployed to http://${name}.localhost:9000`);
    });
}
