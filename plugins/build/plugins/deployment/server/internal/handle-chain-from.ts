import { implement } from "@plugins/infra/plugins/endpoints/server";
import { chainFromEndpoint, type ChainFrom } from "../../shared/endpoints";
import { chainTo, isAncestor, readTarget } from "./git-chain";

/**
 * The chain from one client-held pin up to HEAD.
 *
 * Every arm that cannot produce a walk says WHY, and the reason is the one the
 * client shows the user — so a tab whose commit was rebased away reads as
 * "rebased away", not as a blank chain.
 *
 * Deliberately not memoized and not behind `withHeavyReadSlot`, for the same
 * reason `computeDeploymentState` is not: this is one `merge-base` probe plus a
 * log walk capped at `CHAIN_CAP`, it runs only when a human opens the Build
 * popover on a tab that is actually stale, and `dedupe` on the endpoint already
 * collapses a concurrent burst onto one run.
 */
export const handleChainFrom = implement(
  chainFromEndpoint,
  // The return type is stated, not inferred: without it TypeScript widens each
  // literal's `kind` to `string`, and the union stops being discriminated — the
  // one property the whole contract rests on, lost silently.
  async ({ query }): Promise<ChainFrom> => {
    const target = await readTarget();
    if (!target.resolved) return { kind: "unplaceable", reason: target.reason };

    const onLine = await isAncestor(query.commit, target.value);
    if (!onLine.resolved) return { kind: "unplaceable", reason: onLine.reason };
    if (!onLine.value)
      return {
        kind: "unplaceable",
        reason:
          "this commit is not on the way to HEAD — the checkout was rebased or force-pushed since it was loaded",
      };

    return {
      kind: "chain",
      chain: await chainTo(query.commit, target.value),
    };
  },
);
