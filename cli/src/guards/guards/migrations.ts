import { parseShell } from "../parse-shell";
import type { BashInput, Guard } from "../types";

const MESSAGE =
  "Refusing to delete migration files directly. Migration SQL files and snapshots are managed exclusively by `./singularity build` — never by hand.\n\nTo remove a table or plugin that has a DB migration:\n  1. Remove the table(s) from the plugin's schema.ts.\n  2. Run: ./singularity build --migration-name remove_<plugin_name>\n     Drizzle will generate a DROP TABLE migration automatically and keep the snapshot chain intact.\n\nIf you hit a snapshot-chain Y-fork after rebasing onto main, run:\n  ./singularity build --reset-migration --migration-name <slug>\nThat drops this branch's migration files (anything absent from origin/main) and regenerates them against the new tip — no manual deletion needed.\n\nDeleting migration files manually breaks the snapshot chain for every downstream agent and leaves the DB schema in an inconsistent state (as happened with the yak-shaving removal). If you believe this is a legitimate exception: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. NEVER attempt to bypass this guard on your own — not by restructuring the command, not by using alternative tools, not by any other means.";

export const migrationsGuard: Guard<BashInput> = {
  name: "migrations",
  matcher: "Bash",
  check(input, ctx) {
    if (ctx.hasBypass(".allow-migrations")) return ctx.allow();
    const cmd = input.command;
    if (!cmd) return ctx.allow();
    const { calls } = parseShell(cmd);
    for (const call of calls) {
      if (call.name !== "rm") continue;
      if (call.args.some((a) => a.includes("db/migrations/"))) {
        return ctx.deny(MESSAGE);
      }
    }
    return ctx.allow();
  },
};
