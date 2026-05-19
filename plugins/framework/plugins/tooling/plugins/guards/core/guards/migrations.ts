import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

export const migrationsGuard = defineGuard<BashInput>({
  name: "migrations",
  matcher: "Bash",
  bypassToken: ".allow-migrations",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;
    const { calls } = parseShell(cmd);
    for (const call of calls) {
      if (call.name !== "rm") continue;
      if (call.args.some((a) => a.includes("migrations/data/"))) {
        return {
          blocked: "Refusing to delete migration files directly.",
          why: "Migration SQL files and snapshots are managed exclusively by `./singularity build` — never by hand. Deleting them manually breaks the snapshot chain for every downstream agent and leaves the DB schema in an inconsistent state.",
          hint: "To remove a table or plugin that has a DB migration:\n  1. Remove the table(s) from the plugin's schema.ts.\n  2. Run: ./singularity build --migration-name remove_<plugin_name>\n     Drizzle will generate a DROP TABLE migration automatically and keep the snapshot chain intact.\n\nIf you hit a snapshot-chain Y-fork after rebasing onto main, run:\n  ./singularity build --reset-migration --migration-name <slug>\nThat drops this branch's migration files (anything absent from origin/main) and regenerates them against the new tip.",
        };
      }
    }

    if (/--custom-migration/.test(cmd)) {
      return {
        blocked: "Refusing to use --custom-migration without explicit approval.",
        why: "--custom-migration creates a migration file outside drizzle-kit's normal generation flow. Files created this way are fragile: the runner tracks them by filename hash, so editing after creation silently breaks application. Agents that hit generation failures should stop and report rather than working around with --custom.",
        hint: "If drizzle-kit failed to generate a migration, report the failure to the user.\n\nLegitimate uses of --custom-migration (data backfills, DDL drizzle can't express) require user approval. If the user approves, create .allow-migrations to bypass this guard.",
      };
    }

    return null;
  },
});
