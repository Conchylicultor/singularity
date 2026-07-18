/**
 * Hook-shell tests for `useOptimisticResource`. The pure op lifecycle is pinned
 * by `internal/overlay.test.ts` (bun:test); what only a render can exercise is
 * the WIRING: the dispatch-time `dataUpdateCount` stamp, the QueryCache
 * "updated" subscription, the resolve edge confirming against a push that had
 * ALREADY landed, the keep-rendered failure model (never-revert), the
 * reconnect auto-retry, and the watermark-registry read behind causal denial.
 *
 * `clientLog` is mocked to a no-op (mounting `NotificationsProvider` otherwise
 * schedules real fetch flushes at module eval — same convention as the
 * live-state hazard suites).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  noteResourceTxAcks,
  noteResourceWatermark,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { EndpointError } from "@plugins/infra/plugins/endpoints/web";
import {
  SyncStatusIndicator,
  SyncStatusProvider,
} from "@plugins/primitives/plugins/sync-status/web";
import { useOptimisticResource } from "../internal/use-optimistic-resource";
import { optimisticDivergenceReportSink } from "../reporter";
import type { OptimisticDivergenceReport } from "../reporter";

const rowsResource = resourceDescriptor<number[]>(
  "test.optimistic-mutation.rows",
  z.array(z.number()),
  [],
);
const rowsKey = queryKeyFor(rowsResource.key, undefined);

// A dedicated resource for the causal-denial test: the watermark registry is
// module-level and monotonic, so seeding it must not leak into other tests.
const denialResource = resourceDescriptor<number[]>(
  "test.optimistic-mutation.denial",
  z.array(z.number()),
  [],
);
const denialKey = queryKeyFor(denialResource.key, undefined);

const apply = (current: number[], n: number): number[] => [...current, n];
const isConfirmedBy = (serverData: number[], n: number): boolean => serverData.includes(n);
const sameTarget = (a: number, b: number): boolean => a === b;

type MutateResult = void | { watermark?: string };

/** A `mutate` whose promise the test resolves by hand, to order push vs resolve. */
function deferredMutate() {
  let release!: (res?: MutateResult) => void;
  const mutate = vi.fn(
    () =>
      new Promise<MutateResult>((resolve) => {
        release = resolve;
      }),
  );
  return { mutate, release: (res?: MutateResult) => release(res) };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false, staleTime: Infinity } },
  });
}

/**
 * `contentBased` picks the confirmation ARM, not a flag: the two arms are built
 * as distinct object literals so the args discriminated union stays correlated.
 */
function useRows(
  mutate: (n: number) => Promise<MutateResult>,
  contentBased: boolean,
  resource: typeof rowsResource = rowsResource,
) {
  return useOptimisticResource<number[], number>(
    contentBased
      ? { resource, apply, mutate, isConfirmedBy, sameTarget }
      : { resource, apply, mutate },
  );
}

function mountHook(
  client: QueryClient,
  mutate: (n: number) => Promise<MutateResult>,
  contentBased = false,
  resource: typeof rowsResource = rowsResource,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>{children}</NotificationsProvider>
  );
  return renderHook(() => useRows(mutate, contentBased, resource), { wrapper });
}

afterEach(() => {
  optimisticDivergenceReportSink.register(null);
});

describe("useOptimisticResource", () => {
  it("content-based: a push that lands BEFORE the response still confirms the op", async () => {
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate, true);

    act(() => {
      result.current.dispatch(2);
    });
    expect(result.current.saving).toBe(true);
    expect(result.current.pendingOps).toHaveLength(1);

    // The confirming push arrives first (the measured production ordering). The
    // op is still unresolved, so the push edge must NOT drop it.
    act(() => {
      client.setQueryData(rowsKey, [1, 2]);
    });
    expect(result.current.pendingOps).toHaveLength(1);
    expect(result.current.saving).toBe(true);

    // The HTTP response lands 1ms later. The resolve edge re-asks the cache.
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toEqual([]);
  });

  it("coarse: the dispatch-time generation stamp confirms at the resolve edge", async () => {
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate); // no isConfirmedBy ⇒ coarse

    act(() => {
      result.current.dispatch(2);
    });
    // A push lands while the mutate is still in flight ⇒ dataUpdateCount bumps
    // past the op's dispatchGen.
    act(() => {
      client.setQueryData(rowsKey, [1, 2]);
    });
    expect(result.current.pendingOps).toHaveLength(1);

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.pendingOps).toEqual([]));
    expect(result.current.saving).toBe(false);
  });

  it("coarse: with no push since dispatch, the op stays until the next push", async () => {
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate);

    act(() => {
      result.current.dispatch(2);
    });
    await act(async () => {
      release();
    });
    // Resolved but unconfirmed: no push has landed since dispatch.
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toHaveLength(1);

    act(() => {
      client.setQueryData(rowsKey, [1, 2]);
    });
    expect(result.current.pendingOps).toEqual([]);
  });

  it("a cache 'updated' event that carries NO new value confirms nothing", async () => {
    // query-core emits `type: "updated"` for every state action (fetch, error,
    // invalidate, setState) with `state.data` untouched; only `success` bumps
    // `dataUpdateCount`. Coarse mode drops any resolved op on a push, so an
    // ungated subscription would let a bare invalidate — which delivers no
    // server data at all — confirm the op.
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate);

    act(() => {
      result.current.dispatch(2);
    });
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toHaveLength(1); // resolved, unconfirmed

    await act(async () => {
      // `refetchType: "none"` keeps this a pure `invalidate` action — no queryFn,
      // no value, but it DOES notify the cache.
      await client.invalidateQueries({ queryKey: rowsKey, refetchType: "none" });
    });
    expect(result.current.pendingOps).toHaveLength(1); // still unconfirmed

    // ...and a real push still confirms it.
    act(() => {
      client.setQueryData(rowsKey, [1, 2]);
    });
    expect(result.current.pendingOps).toEqual([]);
  });

  it("stamps `savedAt`, so the universal indicator leaves `idle` for `saved`", async () => {
    // `savedAt` is private to the hook (it is handed to `useReportSync`), so the
    // observable is the indicator itself: it renders NOTHING while `idle`, and
    // the only way out of `idle` here is an explicit `savedAt` stamp — the
    // spinner is suppressed by its 120ms show-delay, and nothing failed.
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    // Published from an EFFECT, never during render: reassigning an outer
    // binding while rendering is a side effect (react-compiler rejects it), and
    // `dispatch` is only ever called from `act()` after the mount has committed.
    const handle: { dispatch?: (n: number) => string } = {};

    function Probe() {
      const { dispatch } = useRows(mutate, true);
      useEffect(() => {
        handle.dispatch = dispatch;
      }, [dispatch]);
      return null;
    }

    const { container } = render(
      <NotificationsProvider queryClient={client}>
        <SyncStatusProvider>
          <Probe />
          <SyncStatusIndicator />
        </SyncStatusProvider>
      </NotificationsProvider>,
    );
    expect(container.innerHTML).toBe(""); // idle ⇒ the cloud renders nothing

    act(() => {
      handle.dispatch!(2);
    });
    act(() => {
      client.setQueryData(rowsKey, [1, 2]); // the push, before the response
    });
    await act(async () => {
      release();
    });

    await waitFor(() => expect(container.innerHTML).not.toBe(""));
  });

  it("an HTTP-rejected mutate keeps the op RENDERED and surfaces it in `failed`", async () => {
    // Never-revert: a durable server rejection is a sync-status state (cloud
    // `error` + Retry), not an undo — the prediction stays in the overlay.
    const client = makeClient();
    const mutate = vi.fn(() => Promise.reject(new EndpointError(422, { message: "nope" })));
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
    });
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.pendingOps).toHaveLength(1); // still rendered
    expect(result.current.data).toEqual([2]); // the prediction did not revert
    expect(result.current.saving).toBe(true); // failed ⇒ still unresolved
  });

  it("retry(opId) re-fires a failed op IN PLACE (same opId, same overlay position)", async () => {
    const client = makeClient();
    const mutate = vi
      .fn<(n: number) => Promise<MutateResult>>()
      .mockRejectedValueOnce(new EndpointError(500, {}))
      .mockResolvedValue(undefined);
    const { result } = mountHook(client, mutate);

    let opId = "";
    await act(async () => {
      opId = result.current.dispatch(2);
    });
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.failed[0]!.opId).toBe(opId);

    await act(async () => {
      result.current.retry(opId);
    });
    await waitFor(() => expect(result.current.failed).toEqual([]));
    // Same op, still in the overlay under its original id, now server-acked.
    expect(result.current.pendingOps).toEqual([{ opId, vars: 2 }]);
    expect(result.current.saving).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("a network-rejected mutate keeps the op rendered as `syncing`, NOT `failed`", async () => {
    // Offline-is-syncing (the Yjs provider's policy): a fetch-level rejection
    // says nothing about the op, so it is not an error state.
    const client = makeClient();
    const mutate = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(result.current.pendingOps).toHaveLength(1); // still rendered
    expect(result.current.data).toEqual([2]);
    expect(result.current.failed).toEqual([]); // network ≠ durable failure
    expect(result.current.saving).toBe(true); // ⇒ phase `syncing`
  });

  it("the browser `online` edge auto-retries network-failed ops", async () => {
    const client = makeClient();
    const mutate = vi
      .fn<(n: number) => Promise<MutateResult>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(undefined);
    const { result } = mountHook(client, mutate);

    let opId = "";
    await act(async () => {
      opId = result.current.dispatch(2);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(result.current.saving).toBe(true); // queued, syncing

    // Connectivity returns: the reconnect edge re-fires the queued op in place.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(result.current.pendingOps).toEqual([{ opId, vars: 2 }]); // resolved, awaiting push
    expect(result.current.failed).toEqual([]);
  });

  it("the reconnect drain retries network-failed ops SEQUENTIALLY in overlay order", async () => {
    // Ordering is load-bearing: structural ops depend on their predecessors'
    // server-side effects (a second split targets the block the first one
    // created). A concurrent replay can land out of order and be durably
    // rejected — the drain must await each op before firing the next.
    const client = makeClient();
    const releases: Array<(res?: MutateResult) => void> = [];
    let offline = true;
    const mutate = vi.fn((_n: number) => {
      if (offline) return Promise.reject(new TypeError("fetch failed"));
      return new Promise<MutateResult>((resolve) => {
        releases.push(resolve);
      });
    });
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
      result.current.dispatch(3);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    offline = false;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    // Only the FIRST op re-fired; the second waits on its outcome.
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3));
    expect(mutate).toHaveBeenLastCalledWith(2);
    expect(releases).toHaveLength(1);

    await act(async () => {
      releases[0]!(undefined);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(4));
    expect(mutate).toHaveBeenLastCalledWith(3);
    await act(async () => {
      releases[1]!(undefined);
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it("a network re-failure stops the drain; the next edge resumes it", async () => {
    // Transport still down ⇒ every later op would fail the same way — stop
    // instead of hammering; the next reconnect edge re-drains from the top.
    const client = makeClient();
    let offline = true;
    const mutate = vi.fn((_n: number) =>
      offline
        ? Promise.reject(new TypeError("fetch failed"))
        : Promise.resolve(undefined as MutateResult),
    );
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
      result.current.dispatch(3);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));

    // A premature edge (still offline): op1 re-fails at network level — op2
    // must NOT be tried.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 20));
    expect(mutate).toHaveBeenCalledTimes(3);
    expect(mutate).toHaveBeenLastCalledWith(2);
    expect(result.current.saving).toBe(true);

    offline = false;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(mutate).toHaveBeenCalledTimes(5);
    expect(mutate.mock.calls.slice(3).map((c) => c[0])).toEqual([2, 3]);
  });

  it("HTTP-failed ops are NOT auto-retried on the `online` edge", async () => {
    // The server already gave a durable verdict; re-firing on reconnect would
    // just repeat it. Only an explicit retry() re-sends.
    const client = makeClient();
    const mutate = vi.fn(() => Promise.reject(new EndpointError(422, {})));
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
    });
    await waitFor(() => expect(result.current.failed).toHaveLength(1));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(mutate).toHaveBeenCalledTimes(1); // untouched
    expect(result.current.failed).toHaveLength(1);
  });

  it("exact ack: an ackTx that landed BEFORE the response confirms at the resolve edge (no snapshot needed)", async () => {
    // The delta-before-HTTP-response race, closed by the registry: the frame
    // carrying this commit's ackTx was noted before the mutate resolved, so the
    // resolve edge's hasAck probe confirms immediately — even though no
    // authoritative snapshot ever landed on this tuple.
    const resource = resourceDescriptor<number[]>(
      "test.optimistic-mutation.ack-race",
      z.array(z.number()),
      [],
    );
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate, true, resource);

    act(() => {
      result.current.dispatch(2);
    });
    // The ack arrives first (a scoped delta / standalone ack frame noted it).
    act(() => {
      noteResourceTxAcks(resource.key, undefined, ["77"]);
    });
    expect(result.current.pendingOps).toHaveLength(1); // still unresolved — untouched

    await act(async () => {
      release({ watermark: "77" });
    });
    await waitFor(() => expect(result.current.pendingOps).toEqual([]));
    expect(result.current.saving).toBe(false);
  });

  it("standalone ack: a registry note with NO cache event confirms a resolved op; sync-status is untouched by the ack edge", async () => {
    const reports: OptimisticDivergenceReport[] = [];
    optimisticDivergenceReportSink.register((r) => {
      reports.push(r);
    });
    const resource = resourceDescriptor<number[]>(
      "test.optimistic-mutation.ack-standalone",
      z.array(z.number()),
      [],
    );
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const { result } = mountHook(client, mutate, true, resource);

    act(() => {
      result.current.dispatch(2);
    });
    await act(async () => {
      release({ watermark: "88" });
    });
    // Resolved with its token; no snapshot, no ack yet — it survives.
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toHaveLength(1);

    // The standalone ack frame: a no-value-change recompute acked the commit.
    // NO setQueryData fires — the registry subscription is the delivery channel.
    act(() => {
      noteResourceTxAcks(resource.key, undefined, ["88"]);
    });
    expect(result.current.pendingOps).toEqual([]);
    // The ack edge is not a sync-status event: nothing failed, nothing saving,
    // and an ack is a confirmation — never a divergence report.
    expect(result.current.saving).toBe(false);
    expect(result.current.failed).toEqual([]);
    expect(reports).toEqual([]);
  });

  it("params re-baseline: old-tuple acks cannot confirm the new tuple; the new tuple's snapshot watermark backstops", async () => {
    // The registry is namespaced per (key, paramsKey), and the hook probes it
    // at `paramsRef.current` — so after a params change, an ack noted under the
    // OLD tuple is invisible, and the op converges via Rule B on the NEW
    // tuple's watermark-carrying snapshot instead.
    const resource = resourceDescriptor<number[]>(
      "test.optimistic-mutation.ack-rebase",
      z.array(z.number()),
      [],
    );
    const client = makeClient();
    const { mutate, release } = deferredMutate();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NotificationsProvider queryClient={client}>{children}</NotificationsProvider>
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: Record<string, string> }) =>
        useOptimisticResource<number[], number>({ resource, params: p, apply, mutate }),
      { wrapper, initialProps: { p: { v: "1" } } },
    );

    act(() => {
      result.current.dispatch(2);
    });
    await act(async () => {
      release({ watermark: "100" });
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toHaveLength(1); // resolved, unconfirmed

    // Params re-baseline mid-flight.
    rerender({ p: { v: "2" } });

    // The commit's ack lands under the OLD tuple — namespaced away: no confirm.
    act(() => {
      noteResourceTxAcks(resource.key, { v: "1" }, ["100"]);
    });
    expect(result.current.pendingOps).toHaveLength(1);

    // The NEW tuple's first watermark-carrying snapshot (its sub-ack) is
    // causally past the commit — the coarse+token Rule B backstop confirms.
    act(() => {
      noteResourceWatermark(resource.key, { v: "2" }, "150");
      client.setQueryData(queryKeyFor(resource.key, { v: "2" }), [1, 2]);
    });
    await waitFor(() => expect(result.current.pendingOps).toEqual([]));
  });

  it("causal denial: a snapshot past the ack token that lacks the op drops it as superseded", async () => {
    // The one sanctioned eviction. mutate returns the commit's ack token (Rule
    // A); a later push whose registry watermark is strictly past it (Rule B)
    // still doesn't reflect the op ⇒ superseded by newer server truth. The op
    // leaves the overlay and the sink reports kind "superseded".
    const reports: OptimisticDivergenceReport[] = [];
    optimisticDivergenceReportSink.register((r) => {
      reports.push(r);
    });

    const client = makeClient();
    const mutate = vi.fn(() => Promise.resolve({ watermark: "100" }));
    const { result } = mountHook(client, mutate, true, denialResource);

    await act(async () => {
      result.current.dispatch(2);
    });
    // Resolved with its token; no snapshot yet, so it survives the resolve edge.
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.pendingOps).toHaveLength(1);

    // The push: registry watermark 150 > ack 100 (seeded exactly where the
    // transport writes it — immediately before the cache write), and the
    // snapshot does NOT contain the op's row ⇒ denied.
    act(() => {
      noteResourceWatermark(denialResource.key, undefined, "150");
      client.setQueryData(denialKey, [1]);
    });
    await waitFor(() => expect(result.current.pendingOps).toEqual([]));
    expect(result.current.data).toEqual([1]); // rendering newer truth
    expect(reports).toHaveLength(1);
    expect(reports[0]!.kind).toBe("superseded");
    expect(reports[0]!.resourceKey).toBe(denialResource.key);
  });
});
