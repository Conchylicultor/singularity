import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

export const migrationsGuard = defineGuard<BashInput>({
  name: "migrations",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;
    const rmMigration = findCall(
      cmd,
      (c) => c.name === "rm" && c.args.some((a) => a.includes("migrations/data/")),
    );
    if (rmMigration) {
      return {
        blocked: "Refusing to delete migration files directly.",
        why: "Migration SQL files and snapshots are managed exclusively by `./singularity build` — never by hand. Deleting them manually breaks the snapshot chain for every downstream agent and leaves the DB schema in an inconsistent state.",
        hint: "To remove a table or plugin that has a DB migration:\n  1. Remove the table(s) from the plugin's schema.ts.\n  2. Run: ./singularity build --migration-name remove_<plugin_name>\n     Drizzle will generate a DROP TABLE migration automatically and keep the snapshot chain intact.\n\nIf you hit a snapshot-chain Y-fork after rebasing onto main, run:\n  ./singularity build --reset-migration --migration-name <slug>\nThat drops this branch's migration files (anything absent from origin/main) and regenerates them against the new tip.",
      };
    }

    return null;
  },
});
