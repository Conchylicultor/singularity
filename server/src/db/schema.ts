// Runtime aggregation: every plugin's tables/views are re-exported here so
// `drizzle({ schema })` in `client.ts` knows about them all. Drizzle-kit
// picks them up via the glob in `drizzle.config.ts`.
//
// Tables come first (load-order leaves) so that any cycles between plugin
// schemas resolve cleanly.
//
// Application code MUST NOT import from this file. Cross-plugin schema
// access goes through the owning plugin's `server/api.ts`, which exposes
// only the tables/views/types meant for outside use.
export * from "@plugins/tasks/server/internal/tables";
export * from "@plugins/conversations/server/internal/tables";
export * from "@plugins/agents/server/internal/tables";
export * from "@plugins/config/server/internal/tables";
export * from "@plugins/stats/plugins/commits/server/internal/tables";
export * from "@plugins/tasks/server/internal/schema";
export * from "@plugins/conversations/server/internal/schema";
export * from "@plugins/agents/server/internal/schema";
