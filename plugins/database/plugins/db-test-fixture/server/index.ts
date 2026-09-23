import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The fixture itself is test code: `createTestDb` is published from
// `./testing` (`@plugins/database/plugins/db-test-fixture/server/testing`),
// which only tests and checks may import.

export default {
  description: "Shared throwaway-database fixture for DB-backed test suites.",
} satisfies ServerPluginDefinition;
