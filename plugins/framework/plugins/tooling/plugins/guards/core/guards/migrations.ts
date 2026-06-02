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
        why: "--custom-migration creates a migration file outside drizzle-kit's normal generation flow. It is for DATA BACKFILLS ONLY (UPDATE/INSERT/DELETE) — these carry no drizzle snapshot, are re-hashed on every build to keep the runner's filename-hash identity honest, and are enforced DML-only by the `data-migration-dml-only` check (no schema changes). Agents that hit generation failures for a real schema change should stop and report, not reach for --custom.",
        hint: "If drizzle-kit failed to generate a SCHEMA migration, report the failure to the user — do not work around it with --custom.\n\nLegitimate use of --custom-migration is a data backfill (DML only). It requires user approval: if the user approves, create .allow-migrations to bypass this guard. The backfill is push-safe — it never joins the snapshot chain, so it cannot Y-fork when main moves.",
      };
    }

    return null;
  },
});
