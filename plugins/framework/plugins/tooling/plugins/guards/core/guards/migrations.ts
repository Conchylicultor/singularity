import { parseArgv } from "../argv";
import type { FileOperand } from "../argv";
import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

/**
 * A migration-data file, or the directory holding them.
 *
 * The `endsWith` arm is a deliberate small broadening: `rm -rf …/migrations/data`
 * deletes the whole directory and is missed by a substring test that requires the
 * trailing slash.
 */
function isMigrationData(operand: FileOperand): boolean {
  return (
    operand.kind === "local" &&
    (operand.path.includes("/migrations/data/") ||
      operand.path.endsWith("/migrations/data"))
  );
}

export const migrationsGuard = defineGuard<BashInput>({
  name: "migrations",
  matcher: "Bash",
  check(input, ctx) {
    const cmd = input.command;
    if (!cmd) return null;
    // Operands, not "every arg that contains the substring": `rm` has no value
    // flags and no leading operand, so this cannot weaken, and it gains the
    // post-`--` operands the old filter dropped as flags. `ctx.cwd` is what
    // makes `cd plugins/x && rm -rf migrations/data` resolve to the same path
    // the absolute spelling does.
    const rmMigration = findCall(
      cmd,
      (c) => c.name === "rm" && parseArgv(c).files.some(isMigrationData),
      ctx.cwd,
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
