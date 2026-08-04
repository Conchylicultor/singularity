import { desc, eq } from "drizzle-orm";
import { fieldsToZodObject } from "@plugins/fields/core";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type {
  CreateEventSourceBody,
  EventSource,
  EventSourceRun,
  UpdateEventSourceBody,
} from "../../core";
import { _eventSources, _eventSourceRuns } from "./tables";
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
  return db
    .select()
    .from(_eventSources)
    .orderBy(desc(_eventSources.createdAt));
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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.config !== undefined) {
    updates.config = validateConfig(current.type, body.config);
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
