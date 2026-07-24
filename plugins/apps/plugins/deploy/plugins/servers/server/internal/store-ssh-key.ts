import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { setSecret } from "@plugins/infra/plugins/secrets/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { _deployServers } from "./tables";
import { type ServerRow } from "./project-server";
import { SSH_SECRET_NAMESPACE } from "./ssh-secret";

/**
 * The tail every key-write path shares: stash the private half, then record the
 * public half on the row.
 *
 * The ordering is load-bearing. `setSecret` first means that if the secrets
 * store is unreachable the column stays NULL, so the row never advertises a key
 * we do not hold — the reverse order would produce exactly the "configured but
 * unusable" state this whole design exists to make unrepresentable. The row
 * update is also what fires the change-feed push refreshing `deploy.servers`;
 * the secret write alone is invisible to it.
 */
export async function storeSshKey(
  serverId: string,
  key: { privateKey: string; publicKey: string },
): Promise<ServerRow> {
  await setSecret({ namespace: SSH_SECRET_NAMESPACE, key: serverId }, key.privateKey);
  const [row] = await db
    .update(_deployServers)
    .set({ sshPublicKey: key.publicKey, updatedAt: new Date() })
    .where(eq(_deployServers.id, serverId))
    .returning();
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

/**
 * Guards a destructive key write behind an explicit `replace`.
 *
 * Keyed on the column rather than `hasSecret`: it is cheaper, it agrees with
 * what the UI shows, and it means a legacy *unusable* stored key (pasted before
 * validation existed, so never derived) no longer 409-blocks the user out of
 * generating a working one.
 */
export function assertReplaceAllowed(row: ServerRow, replace?: boolean): void {
  if (row.sshPublicKey !== null && !replace) {
    throw new HttpError(
      409,
      "An SSH key is already configured for this server. Pass replace: true to overwrite it.",
    );
  }
}
