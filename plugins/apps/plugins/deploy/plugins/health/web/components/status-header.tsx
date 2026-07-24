import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerHealth } from "../hooks";
import { ServerStatusBadge, serverStatus } from "./server-status-badge";

/**
 * The same badge in the server detail page's header row, contributed through
 * `Servers.DetailHeader` — the registry form renders a zone, not a status.
 */
export function ServerStatusHeader({ server }: { server: Server }) {
  const row = useServerHealth(server.id);
  return <ServerStatusBadge status={serverStatus(row)} />;
}
