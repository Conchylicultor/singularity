import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  mapResource,
  useEndpointResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  fileExplorerGitCheckout,
  fileExplorerGitStatus,
  type GitCheckout,
} from "../../shared/resources";
import { indexGitStatus, type GitStatusIndex } from "../../shared/status-index";

/** A folder in a checkout, as the checkout endpoint names it. */
export type Checkout = Extract<GitCheckout, { kind: "checkout" }>;

/**
 * The checkout holding the absolute folder `dir`. Asked once per folder per
 * session: a folder's checkout only changes when a repo is created around it.
 */
export function useGitCheckout(dir: string): ResourceResult<GitCheckout> {
  return useEndpointResource(
    fileExplorerGitCheckout,
    {},
    { query: { path: dir }, staleTime: Number.POSITIVE_INFINITY },
  );
}

/**
 * The live status of the checkout at `root`, indexed for any path below it.
 * `null` reads nothing (no checkout yet) and stays loading — never clean.
 */
export function useGitStatus(
  root: string | null,
): ResourceResult<GitStatusIndex> {
  const status = useLive(
    fileExplorerGitStatus,
    root === null ? null : { root },
  );
  return useMemo(() => mapResource(status, indexGitStatus), [status]);
}

/** The checkout and its indexed status for the folder `dir`. */
export type GitView =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; checkout: Checkout; index: GitStatusIndex };

/**
 * What git knows of the absolute folder `dir`: its checkout, then its status.
 * The view keeps its identity while neither answer changes (it is memoized on
 * the answers, not on the reads' wrappers), so a lens built from it does too.
 */
export function useGitView(dir: string): GitView {
  const checkout = useGitCheckout(dir);
  const checkoutKnown = checkout.status === "ready";
  const found =
    checkoutKnown && checkout.data.kind === "checkout" ? checkout.data : null;
  const status = useGitStatus(found?.root ?? null);
  const checkoutFailure =
    checkout.status === "error" ? checkout.error.message : null;
  const index = status.status === "ready" ? status.data : null;
  const statusFailure = status.status === "error" ? status.error.message : null;
  return useMemo<GitView>(() => {
    if (checkoutFailure !== null)
      return { kind: "failed", message: checkoutFailure };
    if (found !== null && index !== null)
      return { kind: "ready", checkout: found, index };
    if (statusFailure !== null)
      return { kind: "failed", message: statusFailure };
    if (checkoutKnown && found === null) return { kind: "none" };
    return { kind: "loading" };
  }, [checkoutFailure, checkoutKnown, found, index, statusFailure]);
}
