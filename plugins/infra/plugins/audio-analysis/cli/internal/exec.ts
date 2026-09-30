import { runExec } from "@plugins/framework/plugins/server-core/cli";
import { cliExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/cli";
import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import { checkoutNamespace } from "@plugins/infra/plugins/paths/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

/**
 * Run `body` inside this checkout's backend, booted in `exec` mode, handed the
 * CLI's `ExecContext` — this is a process of its own, off every backend's
 * event loop. Never returns (exits 0 / 1).
 */
export async function inThisCheckout(
  body: (exec: ExecContext) => Promise<void>,
): Promise<never> {
  const namespace = await checkoutNamespace(await getWorktreeRoot());
  return runExec(namespace, () => body(cliExecContext()));
}
