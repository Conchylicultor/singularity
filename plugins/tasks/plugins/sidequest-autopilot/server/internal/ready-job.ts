import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { sidequestAutopilotAutomation } from "./automation";

/**
 * A task just became ready to start (`new`: filed, unblocked, un-held or
 * un-dropped). Any task, not only sidequests: on creation the track row may
 * not be written yet, and `fire()` is an in-process no-op while the autopilot
 * is off — when on, the burst settles into one run that reads the backlog.
 */
export const sidequestReadyJob = defineJob({
  name: "sidequest-autopilot.task-ready",
  description:
    "Wakes the Sidequest autopilot when a task becomes ready to start.",
  hold: "instant",
  input: z.object({}),
  dedup: "none",
  event: z.object({ taskId: z.string() }).passthrough(),
  run: () => {
    sidequestAutopilotAutomation.fire();
    return Promise.resolve();
  },
});
