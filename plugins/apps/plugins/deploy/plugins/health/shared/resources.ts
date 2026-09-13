import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { ServerHealthRowSchema, type ServerHealthRow } from "./schemas";

/**
 * Keyed query-resource contract: rows key on `serverId` (the extension's key,
 * whose column is the side-table's `parent_id` PK). The server half is compiled
 * from the extension handle in `server/internal/resource.ts`.
 *
 * Plain (unbounded) `queryResource` is correct here and does NOT need the
 * bounded working-set contract: the set is at most one row per registered
 * server, and servers are hand-registered by a human — an inherently tiny,
 * domain-bounded set, co-bounded with the already-unbounded `deploy.servers`
 * resource it sits beside, and it migrates to the bounded contract together
 * with it.
 */
export const serverHealthResource = queryResourceDescriptor<ServerHealthRow>(
  "deploy.server-health",
  ServerHealthRowSchema,
  "serverId",
);
