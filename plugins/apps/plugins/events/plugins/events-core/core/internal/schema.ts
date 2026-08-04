import { z } from "zod";
import { fieldsToZodObject } from "@plugins/fields/core";
import {
  eventFields,
  eventSourceFields,
  eventSourceRunFields,
} from "./fields";

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
