import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerHealthMap } from "../hooks";
import { ServerStatusBadge, serverStatus } from "./server-status-badge";

/**
 * Field extension contributed into the servers list's `Servers.Fields` factory:
 * a render-callback component that reads this plugin's own live health resource
 * and yields one `status` enum `FieldDef<Server>` closed over it (`value` for
 * filter/group, `cell` for the badge). The registry plugin never names status —
 * remove this plugin and the column simply disappears.
 */
export function StatusField({ render }: FieldExtensionProps<Server>) {
  const map = useServerHealthMap();
  const fields = useMemo<FieldDef<Server>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "enum",
        align: "end",
        options: [
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
          { value: "unknown", label: "Unknown" },
        ],
        value: (s) => serverStatus(map.get(s.id)),
        cell: (s) => <ServerStatusBadge status={serverStatus(map.get(s.id))} />,
      },
    ],
    [map],
  );
  return <>{render(fields)}</>;
}
