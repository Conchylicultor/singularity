import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

export interface ActionContext {
  payload: unknown;
  triggerId: string;
  table: PgTable;
  /**
   * Stable identifier for this dispatch (Graphile job id). Same across retries
   * of a single failed job; distinct across separate emits. Use as an
   * idempotency key when your handler is non-idempotent and `triggerId` alone
   * is insufficient (e.g., a non-oneShot trigger that fires on every emit).
   */
  runId: string;
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
