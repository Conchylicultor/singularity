import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerHealth } from "../hooks";
import { ServerStatusBadge, serverStatus } from "./server-status-badge";

/**
 * The same badge as the servers list's `status` field, as the server detail
 * pane's own status line — a `ServerDetail` section with `chrome: "none"`, so it
 * reads as one row above the identity fields rather than as a titled card.
 *
 * It is contributed rather than read off the server row because the registry
 * owns a server's identity, not its liveness: the verdict lives in this
 * plugin's side-table and only a real probe can write it.
 */
export function ServerStatusHeader({ server }: { server: Server }) {
  const row = useServerHealth(server.id);
  return <ServerStatusBadge status={serverStatus(row)} />;
}
