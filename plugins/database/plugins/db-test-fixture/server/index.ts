import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { createTestDb } from "./internal/create-test-db";
export type { TestDb, CreateTestDbOptions } from "./internal/create-test-db";

export default {
  description: "Shared throwaway-database fixture for DB-backed test suites.",
} satisfies ServerPluginDefinition;
