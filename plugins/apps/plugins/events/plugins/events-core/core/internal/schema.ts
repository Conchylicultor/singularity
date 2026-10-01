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
 * An event as a list shows it: the row without its extraction sighting stamps
 * (`firstSeenAt` / `lastSeenAt`). A re-extraction that finds an event unchanged
 * re-stamps them on every run; nothing a list renders reads them, so a list
 * row that carried them would change — and be pushed to every open list — for
 * a change no one can see.
 */
export const ListedEventSchema = EventSchema.omit({
  firstSeenAt: true,
  lastSeenAt: true,
});
export type ListedEvent = z.infer<typeof ListedEventSchema>;

/**
 * An event as a LIST serves it: the {@link ListedEvent} plus its source's
 * {@link SourceRef} — `sourceType` / `sourceConfig` — joined server-side in the
 * same query.
 *
 * The source travels with the row so a surface resolving "where did this come
 * from?" needs no second read — no subscription to the sources window, no bound
 * on which sources it can see, and no "not loaded yet" to mistake for "has no
 * page". Flat, not nested, because a list's row is a projection of columns
 * (the events list is a live collection: `sourceType` / `sourceConfig` are the
 * joined source row's columns, so an edit to the source's type or config
 * reaches every listed event of it). {@link sourceRefOf} reads the ref back.
 */
export const SourcedEventSchema = ListedEventSchema.extend({
  sourceType: EventSourceSchema.shape.type,
  sourceConfig: EventSourceSchema.shape.config,
});
export type SourcedEvent = z.infer<typeof SourcedEventSchema>;

/** The source ref a listed event carries. */
export function sourceRefOf(event: SourcedEvent): SourceRef {
  return { type: event.sourceType, config: event.sourceConfig };
}

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
 */
export const RunEventSchema = SourcedEventSchema.extend({
  action: z.enum(RUN_EVENT_ACTIONS),
});
export type RunEvent = z.infer<typeof RunEventSchema>;
