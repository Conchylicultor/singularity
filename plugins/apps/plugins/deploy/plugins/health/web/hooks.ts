import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { serverHealthResource, type ServerHealthRow } from "../shared";

/**
 * `Map<serverId, row>` off the live keyed resource. Empty while pending —
 * consumers treat a missing entry as "never checked" (status `unknown`), which
 * is exactly what a server with no probe row means.
 */
export function useServerHealthMap(): ReadonlyMap<string, ServerHealthRow> {
  const result = useResource(serverHealthResource);
  return useMemo(() => {
    if (result.pending) return new Map<string, ServerHealthRow>();
    return new Map(result.data.map((r) => [r.parentId, r]));
  }, [result]);
}

/** The last probe verdict for one server, or `undefined` if never checked. */
export function useServerHealth(serverId: string): ServerHealthRow | undefined {
  return useServerHealthMap().get(serverId);
}

/**
 * Whether the server's *current* key is proven to work: the last probe
 * succeeded AND it was run against the key the server carries right now.
 *
 * The second half is what makes this exact with no cross-plugin write —
 * replacing the key changes `sshKey.publicKey`, the comparison fails, and every
 * consumer (the verify step, the setup flow) drops back to unverified on its
 * own.
 *
 * A server we hold no *identifiable* key for (`sshKey === null`) compares its
 * `null` against whatever the probe recorded: a probe that ran against a real
 * key is correctly no longer proof, and a probe that also recorded `null` (a
 * pre-`sshKey` row) compares equal, which is the honest reading — the same key
 * is still installed, we just can't name it.
 */
export function useServerVerified(server: Server): boolean {
  const row = useServerHealth(server.id);
  return (
    !!row && row.ok && row.checkedPublicKey === (server.sshKey?.publicKey ?? null)
  );
}
