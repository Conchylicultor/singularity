import { useEffect, useRef } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { getRun, runsRevisionResource, type UnionRun } from "../../core";

/**
 * What a by-id read of the merged run space can say.
 *
 * **Four arms, not three.** The two that look foldable are the two that must not
 * be: folding `error` into `missing` lets a transient 500 tell the user their run
 * does not exist — a claim about their data that then reverses itself — and
 * folding it into `pending` spins forever on a surface that is never going to
 * load. `pending` is likewise its own state and never stands in for `missing`:
 * not-known-yet is a state to render, not a value to render as "nothing here".
 */
export type RunRead =
  | { status: "pending" }
  /**
   * Nobody could answer. Typed `Error` rather than `EndpointError` because a
   * network failure rejects out of `fetch` itself as a plain `TypeError` and
   * never reaches the endpoint's own error type; use `getEndpointErrorMessage`
   * to render it.
   */
  | { status: "error"; error: Error }
  /** The ledger was read and holds no such row. An answer, not an absence. */
  | { status: "missing" }
  | { status: "found"; run: UnionRun };

/**
 * One run, by the pair that names it — the read every run-detail surface is
 * built on.
 *
 * The row comes back shaped exactly like a listed one (see `handle-get`), so a
 * detail pane and a list row decode the same columns with the same accessors.
 *
 * **`runs.revision` stays OUT of the query key**, and instead drives an in-place
 * `refetch()` from an effect — the pattern `use-server-data-source` uses for the
 * list. A tick in the key would mint a fresh cache entry on every arm change,
 * and the pane would drop back to `pending` and flash its loading chrome while a
 * row it already has is re-fetched. Refetching in place leaves the last row
 * rendered until the next one lands, which is what makes a running backup's
 * detail update quietly.
 *
 * The tick fires on ANY arm's change, so an open pane re-reads its one row
 * whenever any build finishes. That is one indexed primary-key lookup — do not
 * "optimise" it into per-kind granularity, because it is exactly what keeps an
 * in-flight run's duration and outcome live.
 */
export function useRun(ref: { kind: string; id: string }): RunRead {
  const tick = useResource(runsRevisionResource);
  const changeTick = matchResource(tick, {
    // No tick while it is pending — the first settled `rev` refreshes once.
    pending: () => null,
    ready: (d) => d.rev,
  });

  const { data, isPending, error, refetch } = useEndpoint(getRun, {
    kind: ref.kind,
    id: ref.id,
  });

  // Compare against a ref so the first render never refetches what it just asked
  // for; only an actual move of `rev` re-reads the row. `unknown` because
  // `matchResource` is typed to render — the tick is whatever it handed back,
  // and only its identity is read (the `use-server-data-source` precedent).
  const lastTickRef = useRef<unknown>(changeTick);
  useEffect(() => {
    if (lastTickRef.current === changeTick) return;
    lastTickRef.current = changeTick;
    void refetch();
  }, [changeTick, refetch]);

  if (error) return { status: "error", error };
  if (isPending || !data) return { status: "pending" };
  return data.run ? { status: "found", run: data.run } : { status: "missing" };
}
