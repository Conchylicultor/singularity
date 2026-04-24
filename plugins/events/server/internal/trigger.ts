import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@server/db/client";
import type { ActionRef } from "./action";
import type { EventSource } from "./event";
import { triggerTableRegistry } from "./registry";

export interface TriggerSpec<P> {
  on: EventSource<P>;
  do: ActionRef;
  oneShot?: boolean;
}

// Persist a subscription. Inserts one row into the event's per-type table
// with the filter values, action name, and serialized config.
export async function trigger<P>(spec: TriggerSpec<P>): Promise<string> {
  if (spec.on.__kind !== "event") {
    throw new Error(
      `[events] trigger({ on }) got unsupported source kind: ${(spec.on as { __kind: string }).__kind}`,
    );
  }

  const { def, filter } = spec.on;
  const oneShot = spec.oneShot ?? true;

  const values: Record<string, unknown> = {
    actionName: spec.do.name,
    actionConfig: spec.do.config as Record<string, unknown>,
    oneShot,
  };
  for (const key of Object.keys(def.filterColumns)) {
    values[key] = filter[key] ?? null;
  }

  const rows = await db
    .insert(def.table)
    .values(values)
    .returning({
      // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access.
      id: (def.table as any).id as AnyPgColumn,
    });

  const row = rows[0];
  if (!row) throw new Error(`[events] trigger insert returned no rows`);
  return row.id as string;
}

// Delete a trigger row by id. UUIDs are globally unique so we sweep every
// registered trigger table; the first match deletes, the rest are no-ops.
export async function deleteTrigger(id: string): Promise<void> {
  for (const table of triggerTableRegistry.values()) {
    await db
      .delete(table)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access.
      .where(eq((table as any).id as AnyPgColumn, id));
  }
}
