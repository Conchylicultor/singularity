import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const SubscribeBodySchema = z.object({
  userId: z.string().optional(),
  label: z.string(),
  oneShot: z.boolean().optional(),
});
export type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

export const EmitBodySchema = z.object({
  userId: z.string(),
  message: z.string().optional(),
});
export type EmitBody = z.infer<typeof EmitBodySchema>;

export const DirectEnqueueBodySchema = z.object({
  label: z.string(),
});
export type DirectEnqueueBody = z.infer<typeof DirectEnqueueBodySchema>;

export const DeleteTargetingBodySchema = z.object({
  label: z.string(),
});
export type DeleteTargetingBody = z.infer<typeof DeleteTargetingBodySchema>;

export const subscribeEventsTest = defineEndpoint({
  route: "POST /api/events-test/subscribe",
  body: SubscribeBodySchema,
  response: z.object({ id: z.string() }),
});

export const emitEventsTest = defineEndpoint({
  route: "POST /api/events-test/emit",
  body: EmitBodySchema,
});

export const directEnqueueEventsTest = defineEndpoint({
  route: "POST /api/events-test/direct-enqueue",
  body: DirectEnqueueBodySchema,
  response: z.object({ jobId: z.string() }),
});

const LogEntrySchema = z.object({
  label: z.string(),
  userId: z.string(),
  message: z.string(),
  jobId: z.string(),
  firedAt: z.string(),
});

export const getEventsTestLog = defineEndpoint({
  route: "GET /api/events-test/log",
  response: z.object({ entries: z.array(LogEntrySchema) }),
});

export const resetEventsTest = defineEndpoint({
  route: "POST /api/events-test/reset",
});

export const deleteEventsTestTrigger = defineEndpoint({
  route: "DELETE /api/events-test/trigger/:id",
});

export const deleteEventsTestTargeting = defineEndpoint({
  route: "POST /api/events-test/delete-targeting",
  body: DeleteTargetingBodySchema,
});

export const listEventsTestTriggers = defineEndpoint({
  route: "GET /api/events-test/triggers",
  response: z.object({ rows: z.array(z.record(z.unknown())) }),
});

export const waitEventsTestIdle = defineEndpoint({
  route: "GET /api/events-test/wait-idle",
});

export const crashRecoveryEventsTest = defineEndpoint({
  route: "POST /api/events-test/crash-recovery",
});
