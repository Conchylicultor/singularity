import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { defineJob, UNSAFE_getRegisteredJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { reportServerError } from "@server/error-reporter";
import { triggerTableRegistry } from "./registry";

// The events plugin's dispatcher is itself a registered job. `emit()` enqueues
// one of these per matching trigger row; the handler resolves the trigger's
// target job, parses `jobWith` against the target's `input` schema and
// `eventPayload` against its `event` schema (separately — no merge), invokes
// `target.run({ input, event, ctx })`, and (for oneShot triggers) removes the
// trigger row on success.
//
// Pre-run failures (unknown target, schema drift) throw so Graphile retries
// and eventually marks the job as permanently failed — visible in the worker
// queue rather than silently swallowed. The trigger row is preserved because
// the throw happens before oneShot cleanup. Post-run failures (oneShot
// cleanup) log at error level but don't throw to avoid re-running the target.
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
      const err = new Error(
        `[events] unknown job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId})`,
      );
      reportServerError({ message: err.message, stack: err.stack ?? null });
      throw err;
    }
    const parsedInput = target.inputSchema.safeParse(p.jobWith);
    if (!parsedInput.success) {
      const err = new Error(
        `[events] input drift for job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}): ${parsedInput.error.message}`,
      );
      reportServerError({ message: err.message, stack: err.stack ?? null });
      throw err;
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
        const err = new Error(
          `[events] event drift for job "${p.jobName}" (event "${p.eventName}", trigger ${p.triggerId}): ${parsedEvent.error.message}`,
        );
        reportServerError({ message: err.message, stack: err.stack ?? null });
        throw err;
      }
      eventArg = parsedEvent.data;
    }
    await target.run({ input: parsedInput.data, event: eventArg, ctx });
    if (p.oneShot) {
      const table = triggerTableRegistry.get(p.eventName);
      if (!table) {
        const msg = `[events] unknown event "${p.eventName}" at dispatch (trigger ${p.triggerId}); skipping oneShot cleanup`;
        console.error(msg);
        reportServerError({ message: msg });
        return;
      }
      await db
        .delete(table)
        // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access on untyped PgTable.
        .where(eq((table as any).id as AnyPgColumn, p.triggerId));
    }
  },
});
