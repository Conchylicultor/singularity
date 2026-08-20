import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// The exclusion set a fork must be told about, served by a BOOTED backend.
//
// Exists for one caller: `./singularity db fork`, the escape hatch for a
// worktree created outside the app (`git worktree add`). That runs in a CLI
// process, where server contributions have never been collected — and it cannot
// simply load the plugin registry to collect them, because doing so imports
// `@plugins/database/server`, which builds its pool at module load and throws
// without `SINGULARITY_WORKTREE`. Reading the set over HTTP from a backend that
// HAS booted keeps one source of truth (the declarations themselves) and one
// failure mode: if no backend is up, the CLI says so instead of quietly forking
// everything.
//
// In `core/` rather than `shared/` because the CLI is a different plugin, and
// `shared/` is plugin-private (boundary rule R10).
// Exported separately from the endpoint because the only consumer is the CLI,
// which cannot use `fetchEndpoint` (web-only) and so parses the response itself.
export const forkExclusionsSchema = z.object({
  tableData: z.array(z.string()),
  schemas: z.array(z.string()),
});

export const getForkExclusions = defineEndpoint({
  route: "GET /api/db/fork-exclusions",
  response: forkExclusionsSchema,
  dedupe: true,
});
