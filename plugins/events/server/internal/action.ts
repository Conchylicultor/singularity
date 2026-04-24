import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@server/db/client";
import { actionRegistry, triggerTableRegistry } from "./registry";

export interface ActionRef<Name extends string = string, C = unknown> {
  readonly __kind: "action";
  readonly name: Name;
  readonly config: C;
}

export interface DefineActionSpec<
  Name extends string,
  Schema extends z.ZodType,
> {
  name: Name;
  config: Schema;
  run: (
    config: z.infer<Schema>,
    ctx: { payload: unknown; triggerId: string; table: unknown; runId: string },
  ) => Promise<void> | void;
}

export type ActionFactory<Name extends string, Schema extends z.ZodType> = ((
  config: z.input<Schema>,
) => ActionRef<Name, z.infer<Schema>>) & {
  readonly name: Name;
  readonly schema: Schema;
  deleteTargeting(configMatch: Partial<z.infer<Schema>>): Promise<void>;
};

export function defineAction<
  Name extends string,
  Schema extends z.ZodType,
>(spec: DefineActionSpec<Name, Schema>): ActionFactory<Name, Schema> {
  if (actionRegistry.has(spec.name)) {
    throw new Error(`[events] duplicate action name: ${spec.name}`);
  }
  actionRegistry.set(spec.name, {
    name: spec.name,
    schema: spec.config,
    run: spec.run as (
      config: unknown,
      ctx: { payload: unknown; triggerId: string; table: unknown; runId: string },
    ) => Promise<void> | void,
  });

  const factory = ((config: z.input<Schema>) => ({
    __kind: "action" as const,
    name: spec.name,
    config: config as z.infer<Schema>,
  })) as ActionFactory<Name, Schema>;

  // Override the auto-assigned function name with the action's name so
  // `factory.name` returns e.g. "agents.launch" instead of "factory".
  Object.defineProperty(factory, "name", { value: spec.name });
  Object.defineProperty(factory, "schema", { value: spec.config });
  Object.defineProperty(factory, "deleteTargeting", {
    value: async (configMatch: Partial<z.infer<Schema>>) => {
      await deleteActionsTargeting(
        spec.name,
        configMatch as Record<string, unknown>,
      );
    },
  });

  return factory;
}

// Sweep every trigger table for rows whose action matches and whose config
// contains the given keys (JSONB @> containment).
async function deleteActionsTargeting(
  actionName: string,
  configMatch: Record<string, unknown>,
): Promise<void> {
  const matchJson = JSON.stringify(configMatch);
  for (const table of triggerTableRegistry.values()) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access.
    const actionNameCol = (table as any).actionName as AnyPgColumn;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access.
    const actionConfigCol = (table as any).actionConfig as AnyPgColumn;
    await db
      .delete(table)
      .where(
        and(
          eq(actionNameCol, actionName),
          sql`${actionConfigCol} @> ${matchJson}::jsonb`,
        ),
      );
  }
}
