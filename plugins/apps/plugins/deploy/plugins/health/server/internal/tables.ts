import { _deployServers } from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { serverHealthShape } from "../../shared/schemas";

// Per-server reachability: the last SSH probe's verdict. An entity extension
// rather than a column on `deploy_servers` because this is probe-written state
// with its own writer and lifecycle — the registry holds identity, this holds
// liveness. FK CASCADE on server delete comes free. The row (and which of its
// columns stay server-side) is declared once, as `serverHealthShape` in
// `shared/schemas.ts`.
export const serverHealth = defineExtension(
  _deployServers,
  "health",
  serverHealthShape,
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _deployServersHealthExt = serverHealth.table;
