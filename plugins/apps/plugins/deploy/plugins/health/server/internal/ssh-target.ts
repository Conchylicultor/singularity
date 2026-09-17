import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { SshTarget } from "@plugins/infra/plugins/ssh/server";
import {
  _deployServers,
  getServerSshPrivateKey,
} from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { serverHealth } from "./tables";

export type DeployServerRow = typeof _deployServers.$inferSelect;

/**
 * How a caller treats a server whose host key was never pinned.
 *
 * - `learn-if-unpinned` — trust-on-first-use. Only the connection check may ask
 *   for it, because only the check persists what it learned (a learn that is
 *   not persisted trusts a different host on every call).
 * - `require-pinned` — every other reader of the box: refuse until the check
 *   has verified the connection once.
 */
export type HostKeyPolicy = "learn-if-unpinned" | "require-pinned";

export type ServerSshTargetResult<P extends HostKeyPolicy = HostKeyPolicy> =
  | {
      kind: "ready";
      server: DeployServerRow;
      target: SshTarget;
      /** The pin as it stood when the target was built (null only under `learn-if-unpinned`). */
      pinnedHostKey: string | null;
    }
  | { kind: "not-found" }
  /** No private key stored for this server yet. */
  | { kind: "no-key" }
  /** `require-pinned` and the connection was never verified — absent from the type under `learn-if-unpinned`. */
  | (P extends "require-pinned" ? { kind: "unpinned" } : never);

/**
 * The one construction of "how do I SSH into registered server `serverId`":
 * the registry row's address, the key `servers` holds for it, and the host-key
 * policy derived from the pin this plugin records. Shared by the connection
 * check and every plugin that runs a command on the box, so the address, key
 * and host-key rules cannot drift between them.
 */
export async function resolveServerSshTarget<P extends HostKeyPolicy>(
  serverId: string,
  policy: P,
  opts: { timeoutMs?: number } = {},
): Promise<ServerSshTargetResult<P>> {
  const [server] = await db
    .select()
    .from(_deployServers)
    .where(eq(_deployServers.id, serverId));
  if (!server) return { kind: "not-found" };

  // The private key is asked of `servers` by name; the `deploy-ssh` secret
  // namespace stays that plugin's own.
  const secret = await getServerSshPrivateKey(serverId);
  if (!secret.configured) return { kind: "no-key" };

  const existing = await serverHealth.get(serverId);
  const pinnedHostKey = existing?.hostKeyLine ?? null;
  if (!pinnedHostKey && policy === "require-pinned") {
    // `P` is exactly "require-pinned" on this branch; TS cannot narrow a type
    // parameter from a value comparison.
    return { kind: "unpinned" } as ServerSshTargetResult<P>;
  }

  return {
    kind: "ready",
    server,
    pinnedHostKey,
    target: {
      host: server.host,
      port: server.port,
      user: server.sshUser,
      privateKey: secret.privateKey,
      // Trust-on-first-use: learn the host key on the first successful check,
      // then require an exact match forever after.
      hostKey: pinnedHostKey
        ? { mode: "pinned", knownHostsLine: pinnedHostKey }
        : { mode: "learn" },
      timeoutMs: opts.timeoutMs,
    },
  };
}
