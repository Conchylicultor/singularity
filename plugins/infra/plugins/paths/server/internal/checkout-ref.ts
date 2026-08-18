import { resolve } from "node:path";
import type { CheckoutRef } from "@plugins/infra/plugins/namespace/core";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
import { checkoutWorktreeName } from "../../core/internal/paths";

/**
 * Which checkout a root directory IS, in the form `namespaceFor` accepts.
 *
 * THE one place the "is this the main checkout?" comparison is made. It is a git
 * question (`getMainRepoRoot`), not a name question: comparing a basename
 * against the literal `"singularity"` is only correct while the repo happens to
 * be cloned into a directory of that name, and silently mints the wrong
 * namespace when it is not.
 *
 * Async because the answer comes from git. `getMainRepoRoot` is memoized per
 * cwd, so repeated calls cost one spawn per process.
 */
export async function checkoutRef(root: string): Promise<CheckoutRef> {
  const mainRoot = await getMainRepoRoot(root);
  if (resolve(root) === resolve(mainRoot)) return { kind: "main" };
  return { kind: "worktree", name: checkoutWorktreeName(root) };
}
