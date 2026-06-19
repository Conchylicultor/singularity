import {
  defineServerContribution,
  reportServerError,
} from "@plugins/framework/plugins/server-core/core";
import { notInArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getAllRegisteredJobNames } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { triggerTableRegistry } from "./registry";
import { deleteTriggersFor, trigger } from "./trigger";
import type { TriggerSpec } from "./trigger";

// biome-ignore lint/suspicious/noExplicitAny: type params erased at the contribution boundary
export const Trigger = defineServerContribution<TriggerSpec<any, any>>("trigger");

export async function syncTriggerContributions(): Promise<void> {
  const declared = Trigger.getContributions();
  const seenJobs = new Set<string>();
  for (const t of declared) {
    if (!seenJobs.has(t.do.name)) {
      await deleteTriggersFor(t.do);
      seenJobs.add(t.do.name);
    }
    await trigger(t);
  }
}

// A dangling trigger is a row whose `jobName` is not in the live job registry —
// its target job was removed, so the trigger can never deliver. Returns the
// dangling rows (jobName + count per event) for surfacing before they're swept.
export async function findStaleTriggers(): Promise<
  { eventName: string; jobName: string }[]
> {
  const registeredNames = getAllRegisteredJobNames();
  if (registeredNames.size === 0) return [];
  const dangling: { eventName: string; jobName: string }[] = [];
  for (const [eventName, table] of triggerTableRegistry.entries()) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable
    const jobNameCol = (table as any).jobName as AnyPgColumn;
    const rows = (await db
      .select({ jobName: jobNameCol })
      .from(table)
      .where(notInArray(jobNameCol, [...registeredNames]))) as {
      jobName: string;
    }[];
    for (const r of rows) dangling.push({ eventName, jobName: r.jobName });
  }
  return dangling;
}

export async function sweepStaleTriggers(): Promise<void> {
  const registeredNames = getAllRegisteredJobNames();
  if (registeredNames.size === 0) return;

  // Surface dangling triggers (fail-loud) before deleting them — silent boot
  // deletion hid the signal that a job was removed without cleaning up its
  // triggers.
  const dangling = await findStaleTriggers();
  if (dangling.length > 0) {
    const byJob = [...new Set(dangling.map((d) => d.jobName))].join(", ");
    reportServerError({
      message: `[events] swept ${dangling.length} dangling trigger(s) targeting unregistered job(s): ${byJob}`,
      errorType: "DanglingTriggers",
    });
  }

  for (const table of triggerTableRegistry.values()) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable
    const jobNameCol = (table as any).jobName as AnyPgColumn;
    await db.delete(table).where(notInArray(jobNameCol, [...registeredNames]));
  }
}
