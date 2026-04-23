import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

export interface ActionContext {
  payload: unknown;
  triggerId: string;
  table: PgTable;
}

export interface RegisteredAction {
  name: string;
  schema: z.ZodType;
  run: (config: unknown, ctx: ActionContext) => Promise<void> | void;
}

// Module-load-time registries. Populated by `defineAction` and
// `defineTriggerEvent`. The dispatcher and cleanup helpers iterate them.
export const actionRegistry = new Map<string, RegisteredAction>();
export const triggerTableRegistry = new Map<string, PgTable>();
