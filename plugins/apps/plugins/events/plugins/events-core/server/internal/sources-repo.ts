import { desc, eq, getTableColumns } from "drizzle-orm";
import { fieldsToZodObject } from "@plugins/fields/core";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type {
  CreateEventSourceBody,
  EventSource,
  EventSourceRun,
  RunEvent,
  UpdateEventSourceBody,
} from "../../core";
import {
  _events,
  _eventSources,
  _eventSourceRunEvents,
  _eventSourceRuns,
} from "./tables";
import { getEventSourceType } from "./registry";

// Source CRUD + the validation that keeps a row's `config` and its type's
// `configFields` in agreement. Every failure THROWS an `HttpError` — never a
// null/empty return a caller could mistake for a legitimately-empty success.

function mintId(): string {
  return `evs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate a config blob against the source type's own field record. An unknown
 * `type` is a 400 (the client named something that does not exist), a config
 * that fails its schema is a 400 carrying zod's own message.
 */
function validateConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const sourceType = getEventSourceType(type);
  if (!sourceType) {
    throw new HttpError(400, `Unknown event source type: ${type}`);
  }
  const parsed = fieldsToZodObject(sourceType.configFields).safeParse(config);
  if (!parsed.success) {
    throw new HttpError(
      400,
      `Invalid config for source type "${type}": ${parsed.error.message}`,
    );
  }
  return parsed.data as Record<string, unknown>;
}

/**
 * A readable default name. The URL host when the config carries one (the common
 * case for a scraped page), else the type id — never an empty string.
 */
function deriveName(type: string, config: Record<string, unknown>): string {
  const url = config.url;
  if (typeof url === "string" && url.length > 0) {
    const parsed = URL.parse(url);
    if (parsed) return parsed.host;
  }
  return type;
}

export async function listSources(): Promise<EventSource[]> {
  return db.select().from(_eventSources).orderBy(desc(_eventSources.createdAt));
}

/** Read one source. Throws 404 rather than returning null. */
export async function requireSource(id: string): Promise<EventSource> {
  const [row] = await db
    .select()
    .from(_eventSources)
    .where(eq(_eventSources.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, `Unknown event source: ${id}`);
  return row;
}

export async function createSource(
  body: CreateEventSourceBody,
): Promise<EventSource> {
  const config = validateConfig(body.type, body.config);
  const [row] = await db
    .insert(_eventSources)
    .values({
      id: mintId(),
      type: body.type,
      name: body.name?.trim() || deriveName(body.type, config),
      config,
      refresh: body.refresh ?? "manual",
      enabled: body.enabled ?? true,
      status: "idle",
      // Due immediately, so a scheduled source runs on the next tick instead of
      // waiting a whole cadence for its first watermark to be written.
      nextRunAt: new Date(),
    })
    .returning();
  if (!row) throw new HttpError(500, "insert returned no row");
  return row;
}

export async function updateSource(
  id: string,
  body: UpdateEventSourceBody,
): Promise<EventSource> {
  // Read first: a config write is revalidated against the EXISTING row's type
  // (the type is immutable — see `UpdateEventSourceBodySchema`).
  const current = await requireSource(id);

  // Typed against the table's own insert row, not `Record<string, unknown>`:
  // `refresh` is a DECODED column now, so its encoder runs on this `.set(...)`.
  // A widened value would otherwise be a runtime throw from inside drizzle;
  // here it is a tsc error at the assignment that wrote it.
  const updates: Partial<(typeof _eventSources)["$inferInsert"]> = {
    updatedAt: new Date(),
  };

  // Resolved before the name, because an emptied name re-derives from the config
  // this write is landing, not the one it replaces.
  const config =
    body.config === undefined
      ? current.config
      : validateConfig(current.type, body.config);
  if (body.config !== undefined) updates.config = config;

  // Same rule as `createSource`: trimmed, and never empty. A user who clears the
  // field gets the derived default back rather than a nameless row — the name is
  // this source's only label in the pane title, the list and the events DataView's
  // Source dimension, so "" is not a state any of them can render.
  if (body.name !== undefined) {
    updates.name = body.name.trim() || deriveName(current.type, config);
  }
  if (body.refresh !== undefined) {
    updates.refresh = body.refresh;
    // A cadence change takes effect through the watermark, not the cron.
    updates.nextRunAt = body.refresh === "manual" ? null : new Date();
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  const [row] = await db
    .update(_eventSources)
    .set(updates)
    .where(eq(_eventSources.id, id))
    .returning();
  if (!row) throw new HttpError(404, `Unknown event source: ${id}`);
  return row;
}

/** Deletes the source; `events` and `event_source_runs` cascade. */
export async function deleteSource(id: string): Promise<void> {
  const [row] = await db
    .delete(_eventSources)
    .where(eq(_eventSources.id, id))
    .returning();
  if (!row) throw new HttpError(404, `Unknown event source: ${id}`);
}

/** Read one run. Throws 404 rather than returning null. */
export async function requireRun(runId: string): Promise<EventSourceRun> {
  const [row] = await db
    .select()
    .from(_eventSourceRuns)
    .where(eq(_eventSourceRuns.id, runId))
    .limit(1);
  if (!row) throw new HttpError(404, `Unknown event source run: ${runId}`);
  return row;
}

export async function listRuns(
  sourceId: string,
  limit: number,
): Promise<EventSourceRun[]> {
  return db
    .select()
    .from(_eventSourceRuns)
    .where(eq(_eventSourceRuns.sourceId, sourceId))
    .orderBy(desc(_eventSourceRuns.startedAt))
    .limit(limit);
}

/**
 * The events one run touched, each carrying what that run did to it, ordered by
 * when the event happens — the order a person reads an events list in.
 *
 * The action is projected ONTO the event row rather than nested beside it, so
 * the DataView that renders this treats "what happened to it" as one more
 * dimension of the row, filterable and groupable like any other.
 */
export async function listRunEvents(
  runId: string,
  limit: number,
): Promise<RunEvent[]> {
  return db
    .select({
      // The whole event row, projected from the table itself: a hand-listed
      // column set here would silently drop a field added to `eventFields`.
      ...getTableColumns(_events),
      action: _eventSourceRunEvents.action,
    })
    .from(_eventSourceRunEvents)
    .innerJoin(_events, eq(_events.id, _eventSourceRunEvents.eventId))
    .where(eq(_eventSourceRunEvents.runId, runId))
    .orderBy(_events.startsAt)
    .limit(limit);
}
