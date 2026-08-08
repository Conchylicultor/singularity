import { z } from "zod";
import { fieldsToZodObject } from "@plugins/fields/core";
import {
  eventFields,
  eventSourceFields,
  eventSourceRunEventFields,
  eventSourceRunFields,
} from "./fields";
import { RUN_EVENT_ACTIONS } from "./vocab";

// Public wire schemas, derived from the field records. `entity.table.$inferSelect`
// is identical by construction to `z.infer` of these — a column/schema drift is a
// tsc error, not a silently diverging hand-authored interface.

export const EventSourceSchema = fieldsToZodObject(eventSourceFields);
export type EventSource = z.infer<typeof EventSourceSchema>;

export const EventSchema = fieldsToZodObject(eventFields);
/** Named `EventRecord`, not `Event`: `Event` is a DOM global used in TSX handlers. */
export type EventRecord = z.infer<typeof EventSchema>;

export const EventSourceRunSchema = fieldsToZodObject(eventSourceRunFields);
export type EventSourceRun = z.infer<typeof EventSourceRunSchema>;

export const EventSourceRunEventSchema = fieldsToZodObject(
  eventSourceRunEventFields,
);
export type EventSourceRunEvent = z.infer<typeof EventSourceRunEventSchema>;

/**
 * One event AS TOUCHED BY one run: the whole event row plus what that run did to
 * it. The join is resolved server-side and travels flat, because every consumer
 * of it is a DataView — a nested `{ action, event }` would make `action` a
 * second-class dimension the field schema cannot sort or filter on.
 */
export const RunEventSchema = EventSchema.extend({
  action: z.enum(RUN_EVENT_ACTIONS),
});
export type RunEvent = z.infer<typeof RunEventSchema>;
