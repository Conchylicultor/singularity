import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { validatePin } from "./pinned";
import { queueRanksResource } from "./resource";

export const taskStatusPinJob = defineJob({
  name: "queue.task-status-pin",
  input: z.object({}).passthrough(),
  event: z.object({ taskId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async () => {
    await validatePin();
    queueRanksResource.notify();
  },
});
