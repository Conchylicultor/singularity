import {
  getMainRepoRoot,
  getWorktreeRoot,
} from "@plugins/infra/plugins/spawn/core";
import {
  checkoutNamespace,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import { realGates } from "./gates";
import { runUpgrade, type UpgradeReceipt } from "./runner";
import type { Updater } from "../../core/internal/updater";

/**
 * `./singularity deps upgrade <id>` (and its alias `toolchain upgrade`) in
 * this checkout: refuses the main checkout, writes the receipt in the
 * worktree data dir, runs the real gates. Returns the receipt; the caller
 * turns a `regressed` verdict (files already put back) into a failing exit.
 */
export async function upgradeThisWorktree(
  updater: Updater,
  only: readonly string[] | undefined,
): Promise<UpgradeReceipt> {
  const root = await getWorktreeRoot();
  if (root === (await getMainRepoRoot())) {
    throw new Error(
      `Refusing to run the ${updater.id} upgrade in the main checkout. Main's backend runs on its locks; ` +
        "a new release is proven in a worktree and reaches main through `./singularity push`.",
    );
  }
  const slug = await checkoutNamespace(root);
  const receipt = await runUpgrade({
    updater,
    only,
    root,
    receiptPath: worktreeArtifacts.depsUpgrade(slug, updater.id),
    gates: realGates(root, slug),
    log: (line) => console.log(line),
  });
  return receipt;
}
