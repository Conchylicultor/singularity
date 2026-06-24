/**
 * Install-time provisioning contribution for the zero-cache sidecar, discovered
 * by the framework provisioning runner (defineCollectedDir("provision")) and run
 * during the root `postinstall`. Builds @rocicorp/zero-sqlite3's native addon for
 * the Node-24 ABI, then ensures a Node-24 runtime is available (cached/host/download).
 *
 * ALIAS-FREE: runs in the `bun install` postinstall context where the @plugins
 * path alias does not resolve — node builtins + relative imports only.
 */
import { ensureZeroSqlite3 } from "../scripts/ensure-zero-sqlite3";
import { ensureZeroNode } from "../scripts/ensure-zero-node";

export default async function provision(): Promise<void> {
  await ensureZeroSqlite3();
  await ensureZeroNode();
}
