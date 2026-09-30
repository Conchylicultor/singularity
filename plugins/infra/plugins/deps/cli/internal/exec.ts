import { runExec } from "@plugins/framework/plugins/server-core/cli";
import { checkoutNamespace } from "@plugins/infra/plugins/paths/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

/**
 * Run `body` inside this checkout's backend, booted in `exec` mode: the
 * declared updaters are server contributions, collected only by a boot. Only
 * `deps upgrade` needs this — the dependencies themselves are a generated
 * registry the other verbs read directly. Never returns (exits 0 / 1).
 */
export async function inThisCheckout(
  body: () => Promise<void>,
): Promise<never> {
  const namespace = await checkoutNamespace(await getWorktreeRoot());
  return runExec(namespace, body);
}
