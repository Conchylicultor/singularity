import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  foldResource,
  mapResource,
  ResourceErrorInline,
  useCombinedResources,
} from "@plugins/primitives/plugins/live-state/web";
import {
  servers,
  type Server,
} from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerHealthMap } from "../hooks";
import { ServerStatusBadge, serverStatus } from "./server-status-badge";

/**
 * Field extension contributed into the servers list's `Servers.Fields` factory:
 * a render-callback component that reads this plugin's own live health resource
 * and yields one `status` enum `FieldDef<Server>` closed over it (`value` for
 * filter/group, `cell` for the badge). The registry plugin never names status —
 * remove this plugin and the column simply disappears.
 *
 * A field extension is handed no host rows, so this reads the SAME whole-set
 * `servers` value the servers list itself reads (`deploy/servers`'s
 * `ServersList`) to get every id worth asking about, then probes exactly those
 * ids via `useServerHealthMap` — never the health collection's bounded default
 * window, which would silently drop verdicts past its rank cutoff.
 *
 * While either read is still loading the column has no answers yet — `value:
 * null` and an empty cell — rather than `unknown`, which would claim every
 * server was never checked (and match an `Unknown` filter it has no business
 * matching). A failed read has no answers either (`value: null`), and its cell
 * says so: the error icon, whose click retries.
 */
export function StatusField({ render }: FieldExtensionProps<Server>) {
  const serversResult = useLive(servers);
  // Narrow through `mapResource`, never a bare `serversResult.status … ? [] :
  // …` — that would collapse "still loading" into "no servers" for whoever
  // reads the array. The id set below is only a subscription key for the
  // point read; `combined` is what actually decides whether the column has an
  // answer, so a placeholder empty array here while `servers` itself loads is
  // harmless.
  const idsResult = useMemo(
    () => mapResource(serversResult, (list) => list.map((s) => s.id)),
    [serversResult],
  );
  const serverIds = foldResource(idsResult, {
    loading: () => [],
    error: (_error, stale) => stale ?? [],
    ready: (ids) => ids,
  });
  const health = useServerHealthMap(serverIds);
  const combined = useCombinedResources({ servers: serversResult, health });

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
        value: (s) =>
          foldResource(combined, {
            loading: () => null,
            error: () => null,
            ready: ({ health: map }) => serverStatus(map.get(s.id)),
          }),
        cell: (s) =>
          foldResource(combined, {
            loading: () => null,
            error: (error) => (
              <ResourceErrorInline
                variant="icon"
                subject="the server's status"
                error={error}
                refetch={combined.refetch}
              />
            ),
            ready: ({ health: map }) => (
              <ServerStatusBadge status={serverStatus(map.get(s.id))} />
            ),
          }),
      },
    ],
    [combined],
  );
  return <>{render(fields)}</>;
}
