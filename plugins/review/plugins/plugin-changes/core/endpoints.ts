import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const pluginChangesResponse = z.object({ plugins: z.array(z.any()) });

export const getPluginChanges = defineEndpoint({
  route: "GET /api/review/plugin-changes",
  query: z.object({
    conversationId: z.string(),
    pushId: z.string().optional(),
  }),
  response: pluginChangesResponse,
  // Spawns `git archive | tar` + diff subprocesses; cap concurrent runs so a
  // burst across worktrees can't saturate the shared box, and dedupe identical
  // concurrent requests (same conversation/push) onto one run. See
  // research/2026-06-15-global-live-state-cascade-contention.md (Change 5).
  concurrency: 2,
  dedupe: true,
});
