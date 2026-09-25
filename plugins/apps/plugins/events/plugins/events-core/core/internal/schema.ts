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

/**
 * What a surface needs to know about a source to say what it stands for: its
 * `type` (which `EventSources.Type` reads it) and the `config` that type reads.
 * The rest of the row — status, watermarks, the user's label — is not part of
 * "where does this point".
 */
export const SourceRefSchema = EventSourceSchema.pick({
  type: true,
  config: true,
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * An event as a LIST serves it: the event row plus its source's
 * {@link SourceRef}, joined server-side in the same query.
 *
 * The source travels with the row so a surface resolving "where did this come
 * from?" needs no second read — no subscription to the sources window, no bound
 * on which sources it can see, and no "not loaded yet" to mistake for "has no
 * page". The one cost is staleness: an edit to the source's config reaches the
 * row on the list's next fetch.
 */
export const SourcedEventSchema = EventSchema.extend({
  source: SourceRefSchema,
});
export type SourcedEvent = z.infer<typeof SourcedEventSchema>;

export const EventSourceRunSchema = fieldsToZodObject(eventSourceRunFields);
export type EventSourceRun = z.infer<typeof EventSourceRunSchema>;

export const EventSourceRunEventSchema = fieldsToZodObject(
  eventSourceRunEventFields,
);
export type EventSourceRunEvent = z.infer<typeof EventSourceRunEventSchema>;

/**
 * One event AS TOUCHED BY one run: the whole sourced event row plus what that
 * run did to it. The action is resolved server-side and travels flat, because
 * every consumer of it is a DataView — a nested `{ action, event }` would make
 * `action` a second-class dimension the field schema cannot sort or filter on.
 * (`source` stays nested: it is what the row opens, not a dimension.)
 */
export const RunEventSchema = SourcedEventSchema.extend({
  action: z.enum(RUN_EVENT_ACTIONS),
});
export type RunEvent = z.infer<typeof RunEventSchema>;
