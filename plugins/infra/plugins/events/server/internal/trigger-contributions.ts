import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
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

export async function sweepStaleTriggers(): Promise<void> {
  const registeredNames = getAllRegisteredJobNames();
  if (registeredNames.size === 0) return;
  for (const table of triggerTableRegistry.values()) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable
    const jobNameCol = (table as any).jobName as AnyPgColumn;
    await db.delete(table).where(notInArray(jobNameCol, [...registeredNames]));
  }
}
