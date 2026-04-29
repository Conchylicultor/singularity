import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { defineJob, UNSAFE_getRegisteredJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@server/db/client";
import { triggerTableRegistry } from "./registry";

// The events plugin's dispatcher is itself a registered job. `emit()` enqueues
// one of these per matching trigger row; the handler resolves the trigger's
// target job, parses `jobWith` against the target's `input` schema and
// `eventPayload` against its `event` schema (separately — no merge), invokes
// `target.run({ input, event, ctx })`, and (for oneShot triggers) removes the
// trigger row on success.
//
// Preservation policy lives here, not in the Layer-1 jobs worker: on unknown
// target job or schema drift on either side, we log and return (the graphile
// job completes without throwing, so it isn't retried forever; the trigger
// row is preserved for later code fixes). Handler throws still bubble up so
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
  // The dispatcher itself never reads an event payload — it only delivers
  // them to other jobs.
  event: z.never(),
  run: async ({ input: p, ctx }) => {
    const target = UNSAFE_getRegisteredJob(p.jobName);
    if (!target) {
      console.warn(
        `[events] unknown job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row`,
      );
      return;
    }
    const parsedInput = target.inputSchema.safeParse(p.jobWith);
    if (!parsedInput.success) {
      console.warn(
        `[events] input drift for job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row:`,
        parsedInput.error.issues,
      );
      return;
    }
    // `event: z.never()` is the sentinel for "this job ignores events"; skip
    // the parse and pass undefined. Otherwise validate the payload too.
    const isNeverEvent =
      // biome-ignore lint/suspicious/noExplicitAny: zod's _def.typeName is private but stable.
      (target.eventSchema._def as any)?.typeName === "ZodNever";
    let eventArg: unknown = undefined;
    if (!isNeverEvent) {
      const parsedEvent = target.eventSchema.safeParse(p.eventPayload);
      if (!parsedEvent.success) {
        console.warn(
          `[events] event drift for job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row:`,
          parsedEvent.error.issues,
        );
        return;
      }
      eventArg = parsedEvent.data;
    }
    await target.run({ input: parsedInput.data, event: eventArg, ctx });
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
