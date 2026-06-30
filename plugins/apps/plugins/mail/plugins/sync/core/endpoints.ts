import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Manual "connect / sync now" trigger. POST with no body — `ensureAccount()`
// arms the engine and, when already in delta, enqueues an immediate delta. Used
// by the phase-3 UI and for worktree testing (the scheduled tick is main-only).
export const mailSyncEndpoint = defineEndpoint({
  route: "POST /api/mail/sync",
  response: z.object({ accountId: z.string(), status: z.string() }),
});
