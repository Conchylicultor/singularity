import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { defineJob, UNSAFE_getRegisteredJob } from "@plugins/jobs/server";
import { db } from "@server/db/client";
import { triggerTableRegistry } from "./registry";

// The events plugin's dispatcher is itself a registered job. `emit()` enqueues
// one of these per matching trigger row; the handler resolves the trigger's
// target job, merges `jobWith ∪ eventPayload` as the target's input, runs it,
// and (for oneShot triggers) removes the trigger row on success.
//
// Preservation policy lives here, not in the Layer-1 jobs worker: on unknown
// target job or input-schema drift, we log and return (the graphile job
// completes without throwing, so it isn't retried forever; the trigger row
// is preserved for later code fixes). Handler throws still bubble up so
// Graphile retries up to `maxAttempts`. See docs/events.md §"Preservation".
export const eventsDispatchJob = defineJob({
  name: "events.dispatch",
  input: z.object({
    eventName: z.string(),
    triggerId: z.string().uuid(),
    jobName: z.string(),
    jobWith: z.record(z.unknown()),
    eventPayload: z.record(z.unknown()),
    oneShot: z.boolean(),
  }),
  run: async (p, ctx) => {
    const target = UNSAFE_getRegisteredJob(p.jobName);
    if (!target) {
      console.warn(
        `[events] unknown job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row`,
      );
      return;
    }
    const merged = { ...p.jobWith, ...p.eventPayload };
    const parsed = target.inputSchema.safeParse(merged);
    if (!parsed.success) {
      console.warn(
        `[events] input drift for job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row:`,
        parsed.error.issues,
      );
      return;
    }
    await target.run(parsed.data, ctx);
    if (p.oneShot) {
      const table = triggerTableRegistry.get(p.eventName);
      if (!table) {
        console.warn(
          `[events] unknown event "${p.eventName}" at dispatch (trigger ${p.triggerId}); skipping oneShot cleanup`,
        );
        return;
      }
      await db
        .delete(table)
        // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access on untyped PgTable.
        .where(eq((table as any).id as AnyPgColumn, p.triggerId));
    }
  },
});
