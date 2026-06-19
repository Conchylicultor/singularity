import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const EmissionRowSchema = z.object({
  id: z.string(),
  eventName: z.string(),
  payload: z.record(z.unknown()),
  matchedCount: z.number(),
  matchedTriggerIds: z.array(z.string()),
  emittedAt: z.string(),
});
export type EmissionRow = z.infer<typeof EmissionRowSchema>;

export const EmissionsPayloadSchema = z.object({
  rows: z.array(EmissionRowSchema),
});
export type EmissionsPayload = z.infer<typeof EmissionsPayloadSchema>;

export const TriggerRowSchema = z.object({
  eventName: z.string(),
  id: z.string(),
  jobName: z.string(),
  jobWith: z.record(z.unknown()),
  enabled: z.boolean(),
  oneShot: z.boolean(),
  createdAt: z.string(),
  filters: z.record(z.unknown()),
  // Computed (not stored): true when `jobName` is not in the live job registry,
  // i.e. the target job was removed and this trigger can never deliver. Transient
  // — the boot sweep deletes dangling rows, so this is surfaced, never persisted.
  dangling: z.boolean(),
});
export type TriggerRow = z.infer<typeof TriggerRowSchema>;

export const TriggersPayloadSchema = z.object({
  rows: z.array(TriggerRowSchema),
});
export type TriggersPayload = z.infer<typeof TriggersPayloadSchema>;

export const eventEmissionsResource = resourceDescriptor<EmissionsPayload>(
  "event-emissions",
  EmissionsPayloadSchema,
  { rows: [] },
);

export const eventTriggersResource = resourceDescriptor<TriggersPayload>(
  "event-triggers",
  TriggersPayloadSchema,
  { rows: [] },
);
