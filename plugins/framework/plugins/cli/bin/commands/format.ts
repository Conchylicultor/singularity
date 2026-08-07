import type { Command } from "commander";
import { formatChangedSources } from "@plugins/framework/plugins/tooling/plugins/format/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

/**
 * The escape hatch that makes `format-clean` livable at push time. `push` never
 * builds — it spawns `check --scope tree` in a subprocess — so without this
 * command the only fix for a stray whitespace diff would be a multi-minute
 * build (build lock + Postgres wait + DB fork + every check + vite).
 *
 * It contains ZERO new logic on purpose: it is a thin wrapper over the exact
 * `formatChangedSources` that `./singularity build` calls, or the repo's format
 * policy would have two implementations that could disagree. Before a build it
 * is subsumed; after one it is a no-op.
 */
export function registerFormat(program: Command) {
  program
    .command("format")
    .description(
      "Format every .ts/.tsx changed on this branch (vs merge-base with main) " +
        "with prettier. The SAME pass `./singularity build` runs — use it to " +
        "satisfy `format-clean` without paying for a full build. Idempotent.",
    )
    .action(async () => {
      const root = await getWorktreeRoot();
      const { formatted } = await formatChangedSources({
        root,
        log: (line) => console.log(line),
      });
      console.log(`Formatted ${formatted.length} file(s).`);
    });
}
