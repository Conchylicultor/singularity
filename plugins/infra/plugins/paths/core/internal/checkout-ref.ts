import { resolve } from "node:path";
import {
  MAIN_COMPOSITION_ID,
  namespaceFor,
  type CheckoutRef,
  type Namespace,
} from "@plugins/infra/plugins/namespace/core";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
// Relative sibling rather than the `@plugins/infra/plugins/paths/core` alias:
// this file lives INSIDE the `paths` plugin, so the alias would cycle back
// through the barrel that re-exports it. Same reasoning as `data-dir.ts`
// importing `./paths`.
import { checkoutWorktreeName } from "./paths";

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

/**
 * The namespace a checkout's OWN app answers to — the second of the three
 * questions that look alike and are not (see `deploysForCheckout` for the
 * third, and `currentWorktreeName` for the first).
 *
 * This pair — the main composition, plus the checkout git says this root is —
 * was hand-spelled at five call sites: `build`, its hermetic posture, `check`,
 * `push` and the prototype URL formatter. Five copies of one derivation is how
 * one of them ends up reading the environment instead, which answers
 * `singularity` from every worktree; naming the mint is what leaves nothing to
 * spell differently.
 *
 * It says which namespace this checkout WOULD serve, not that anything is
 * serving it: a checkout that has never been built still has one. Ask
 * `resolveCheckoutDeploy(root)` when the question is what is actually deployed.
 */
export async function checkoutNamespace(root: string): Promise<Namespace> {
  return namespaceFor(MAIN_COMPOSITION_ID, await checkoutRef(root));
}
