import type { CentralPluginDefinition } from "@central/types";
import { handleStatus } from "./internal/handlers";
import { onReady, onShutdown } from "./internal/supervisor";

export { ready } from "./internal/supervisor";
export { PG_PORT, PG_SOCKET_DIR, PG_USER, useSystemPg } from "./internal/paths";

export default {
  id: "database",
  name: "Database",
  description:
    "Embedded Postgres on the central runtime. Single shared cluster, one DB per worktree. Replaces user-installed system PG.",
  loadBearing: true,
  httpRoutes: {
    "GET /api/database/status": handleStatus,
  },
  onReady,
  onShutdown,
} satisfies CentralPluginDefinition;
