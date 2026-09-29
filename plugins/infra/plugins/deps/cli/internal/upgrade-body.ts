import { declaredUpdaters } from "@plugins/infra/plugins/deps/plugins/updates/server";
import { upgradeThisWorktree } from "@plugins/infra/plugins/deps/plugins/updates/cli";

/**
 * The body of `deps upgrade`, in its own module because it imports the
 * updates plugin's server barrel statically: that barrel evaluates config
 * needing the runtime namespace, so this module may only load inside
 * `runExec` (see `./upgrade.ts`).
 */
export async function upgrade(
  id: string,
  only: readonly string[] | undefined,
): Promise<void> {
  const updaters = declaredUpdaters();
  const updater = updaters.find((u) => u.id === id);
  if (updater === undefined) {
    throw new Error(
      `No updater ${JSON.stringify(id)}. Updaters: ${updaters.map((u) => u.id).join(", ") || "none"}.`,
    );
  }
  const receipt = await upgradeThisWorktree(updater, only);
  console.log(`\nverdict: ${receipt.verdict}`);
  if (receipt.verdict === "regressed") {
    throw new Error(
      `${id}: regressed — the lock was put back (see the receipt above).`,
    );
  }
}
