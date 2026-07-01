import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  fieldsToZodObject,
  type FieldsRecord,
} from "@plugins/fields/core";
import { uuidField } from "@plugins/fields/plugins/uuid/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";

// One emission row. The `event_emissions` table and the `EmissionRow` wire
// schema both derive from this single field record (via defineEntity on the
// server), so a column/schema drift is unrepresentable and the loader returns
// `db.select()` rows verbatim. `emittedAt` is a coerced Date on the wire.
export const eventEmissionFields = {
  id:                uuidField(),
  eventName:         textField(),
  payload:           jsonField<Record<string, unknown>>({ schema: z.record(z.unknown()), default: {} }),
  matchedCount:      intField(),
  matchedTriggerIds: jsonField<string[]>({ schema: z.array(z.string()), default: [] }),
  emittedAt:         dateField(),
} satisfies FieldsRecord;

export const EmissionRowSchema = fieldsToZodObject(eventEmissionFields);
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
