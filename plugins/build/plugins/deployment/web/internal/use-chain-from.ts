import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { chainFromEndpoint, type ChainFrom } from "../../shared/endpoints";

/**
 * What this client knows about the chain below the server's own.
 *
 * `idle` is a real arm, not an absence: when no carrier sits off the server's
 * chain there is nothing to ask, which is a different state from "asked and
 * still waiting". Collapsing the two is what would make a settled chain flash
 * a loading row on every popover open.
 */
export type ChainFromReading =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "failed"; reason: string }
  | ChainFrom;

/**
 * The chain from a commit only this browser knows about, up to HEAD.
 *
 * `commit === null` means nothing is off-chain, and the request is not made at
 * all — `enabled` rather than a conditional hook, so the hook order is fixed.
 *
 * `staleTime: Infinity` because the answer cannot go stale while the popover is
 * open in the way that matters: the pin is baked into this page and never moves,
 * and if HEAD advances the deployment resource pushes and the chain is asked for
 * again. What it buys is the common case: opening and closing the popover five
 * times does one git walk, not five.
 */
export function useChainFrom(commit: string | null): ChainFromReading {
  const result = useEndpoint(
    chainFromEndpoint,
    {},
    {
      query: commit === null ? undefined : { commit },
      enabled: commit !== null,
      staleTime: Infinity,
    },
  );
  if (commit === null) return { kind: "idle" };
  if (result.data !== undefined) return result.data;
  // A transport failure is not "unplaceable" — the commit may be perfectly
  // placeable and the request simply did not land — so it gets its own arm and
  // its own sentence.
  if (result.error) return { kind: "failed", reason: result.error.message };
  return { kind: "pending" };
}
