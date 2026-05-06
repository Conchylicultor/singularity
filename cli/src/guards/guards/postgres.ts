import { parseShell } from "../parse-shell";
import type { BashInput, Guard } from "../types";

const POSTGRES_COMMANDS = new Set([
  "psql",
  "pg_dump",
  "pg_dumpall",
  "pg_restore",
  "createdb",
  "dropdb",
  "createuser",
  "dropuser",
  "pg_isready",
  "pg_basebackup",
  "pg_ctl",
  "postgres",
  "postmaster",
  "vacuumdb",
  "reindexdb",
  "clusterdb",
]);

const MESSAGE =
  "Direct PostgreSQL CLI commands are forbidden. Use the `query_db` MCP tool for database inspection and debugging — it runs read-only queries against the worktree's database safely.\n\nBlocked commands: psql, pg_dump, pg_restore, createdb, dropdb, and other pg_* utilities.\n\nDatabase mutations are managed by the server (migrations via `./singularity build`). If you need to inspect data, use the `query_db` MCP tool. If you believe this block is a false positive and the call was legitimate: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. If the user explicitly approves, they will tell you to create $PWD/.allow-postgres to bypass.";

export const postgresGuard: Guard<BashInput> = {
  name: "postgres",
  matcher: "Bash",
  check(input, ctx) {
    if (ctx.hasBypass(".allow-postgres")) return ctx.allow();
    const cmd = input.command;
    if (!cmd) return ctx.allow();
    const { calls } = parseShell(cmd);
    for (const call of calls) {
      if (POSTGRES_COMMANDS.has(call.name)) {
        return ctx.deny(MESSAGE);
      }
    }
    return ctx.allow();
  },
};
