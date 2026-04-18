// Re-export both internal (tables) and public (views) so drizzle-kit picks
// up every entity. Application code must import from the plugin's public
// `schema.ts` — internal tables are only for in-plugin writers.
export * from "@plugins/tasks/server/schema_internal";
export * from "@plugins/conversations/server/schema_internal";
export * from "@plugins/agents/server/schema_internal";
export * from "@plugins/tasks/server/schema";
export * from "@plugins/conversations/server/schema";
export * from "@plugins/agents/server/schema";
