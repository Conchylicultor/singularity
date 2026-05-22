import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { defineJob, UNSAFE_getRegisteredJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import { triggerTableRegistry } from "./registry";

// The events plugin's dispatcher is itself a registered job. `emit()` enqueues
// one of these per matching trigger row; the handler resolves the trigger's
// target job, validates the event payload against the target's event schema,
// and enqueues the target via `target.enqueue()`. This gives the target its
// own graphile queue row, its own `workflowRunId`, and its own dedup key —
// the same path as a direct `.enqueue()` call.
//
// For oneShot triggers, the trigger row is deleted after the target is
// durably enqueued — the trigger has served its purpose. If the target
// later fails, graphile retries it independently.
//
// Unknown targets (stale triggers referencing deleted jobs) are self-healed:
// the orphaned trigger row is removed and dispatch returns without throwing.
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
  event: z.never(),
  run: async ({ input: p }) => {
    const target = UNSAFE_getRegisteredJob(p.jobName);
    if (!target) {
      const msg = `[events] removing stale trigger ${p.triggerId}: job "${p.jobName}" no longer exists (event "${p.eventName}")`;
      console.warn(msg);
      reportServerError({ message: msg });
      const table = triggerTableRegistry.get(p.eventName);
      if (table) {
        await db
          .delete(table)
          // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access on untyped PgTable
          .where(eq((table as any).id as AnyPgColumn, p.triggerId));
      }
      return;
    }

    // Validate the event payload before enqueuing. `z.never()` means the
    // target ignores events — pass undefined. The target's input schema is
    // validated inside `enqueue()` itself (via `spec.input.parse()`).
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

    await target.enqueue(p.jobWith, { _event: eventArg });

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
