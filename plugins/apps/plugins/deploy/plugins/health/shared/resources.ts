import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { ServerHealthRowSchema, type ServerHealthRow } from "./schemas";

/**
 * Keyed query-resource contract: rows key on `parentId` (the side-table PK).
 * The server half is compiled from the drizzle declaration in
 * `server/internal/resource.ts`.
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
  "parentId",
);
