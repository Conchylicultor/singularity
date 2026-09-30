import { BackgroundTriggerSource } from "@plugins/infra/plugins/background/plugins/catalog/server";
import { Trigger } from "./trigger-contributions";

/**
 * Tells the Background activity catalog which events start a job: the events
 * named by the job's declared `Trigger` contributions. (Triggers created at
 * runtime — a workflow waiting on one conversation — are per-instance rows, not
 * a statement about the job, and are not listed.) Keyed to the jobs provider's
 * `job` kind; the catalog applies it without naming either side.
 */
export const jobEventTriggerSource = BackgroundTriggerSource({
  kind: "job",
  eventNames: (jobName) =>
    Trigger.getContributions()
      .filter((t) => t.do.name === jobName)
      .map((t) => t.on.def.name),
});
