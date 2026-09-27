import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { _deployServers } from "./tables";
import { toServers } from "./project-server";
import { servers } from "../../shared/resources";
import type { Server } from "../../shared/schemas";

async function loadServers(): Promise<Server[]> {
  const rows = await db
    .select()
    .from(_deployServers)
    .orderBy(asc(_deployServers.createdAt));
  return toServers(rows);
}

// Recomputed (and pushed whole) on every write to `deploy_servers`, which the
// loader's captured read-set routes here. A key change needs no hand-notify
// either: storing a key also writes the row's `ssh_public_key`
// (`store-ssh-key.ts`), and that update is the change the feed sees.
export const serversServed = serveValue(servers, {
  source: "db",
  loader: loadServers,
  unbounded: {
    reason:
      "the hand-registered server registry; each row's sshKey is derived from a central secrets lookup, which a column projection cannot express",
  },
});
