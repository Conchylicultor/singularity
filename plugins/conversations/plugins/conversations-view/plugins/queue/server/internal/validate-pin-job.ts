import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { validatePin } from "./pinned";
import { queueRanksResource } from "./resource";

// Fired on `conversationTurnCompleted`. When an agent finishes a turn, the
// conversation becomes `waiting`. If no pin exists yet, validatePin sets
// the top-ranked waiting conversation as the pinned focus item.
export const validatePinJob = defineJob({
  name: "queue.validate-pin",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  dedup: "none",
  maxAttempts: 2,
  run: async () => {
    await validatePin();
    queueRanksResource.notify();
  },
});
