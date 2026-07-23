import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { orphanReportSchema } from "@plugins/config_v2/core";

// Read-only audit of the current worktree's USER-layer config dir: every
// on-disk config file whose owning `defineConfig` descriptor is no longer live.
// The full report is returned in one response (bounded — a few orphans at most);
// domain logic lives in config_v2, which owns config layout.
export const configOrphans = defineEndpoint({
  route: "GET /api/debug/config-orphans",
  response: orphanReportSchema,
});
