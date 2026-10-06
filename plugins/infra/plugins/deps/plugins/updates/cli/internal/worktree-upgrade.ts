import {
  getMainRepoRoot,
  getWorktreeRoot,
} from "@plugins/infra/plugins/spawn/core";
import {
  checkoutNamespace,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import { realGates } from "./gates";
import {
  runUpgrade,
  type UpgradeReceipt,
  type UpgradeSelection,
} from "./runner";

/**
 * `./singularity deps upgrade [<id>]` (and its alias `toolchain upgrade`) in
 * this checkout: refuses the main checkout, writes the receipt in the
 * worktree data dir (`deps-upgrade-<id>.json` for one updater,
 * `deps-upgrade.json` for a batch of several), runs the real gates. Returns the
 * receipt; the caller turns a `regressed` verdict (files already put back)
 * into a failing exit.
 */
export async function upgradeThisWorktree(
  selection: readonly UpgradeSelection[],
): Promise<UpgradeReceipt> {
  const root = await getWorktreeRoot();
  if (root === (await getMainRepoRoot())) {
    throw new Error(
      `Refusing to run the ${selection.map((s) => s.updater.id).join(", ")} upgrade in the main checkout. Main's backend runs on its locks; ` +
        "a new release is proven in a worktree and reaches main through `./singularity push`.",
    );
  }
  const slug = await checkoutNamespace(root);
  const only = selection.length === 1 ? selection[0] : undefined;
  return runUpgrade({
    selection,
    root,
    receiptPath:
      only !== undefined
        ? worktreeArtifacts.depsUpgrade(slug, only.updater.id)
        : worktreeArtifacts.depsUpgradeBatch(slug),
    gates: realGates(root, slug),
    log: (line) => console.log(line),
  });
}
