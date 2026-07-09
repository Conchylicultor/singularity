/**
 * Hook-shell tests for `useOptimisticResource`. The pure op lifecycle is pinned
 * by `internal/overlay.test.ts` (bun:test); what only a render can exercise is
 * the WIRING: the dispatch-time `dataUpdateCount` stamp, the QueryCache
 * "updated" subscription, and — the bug this hook was rewritten for — the
 * resolve edge confirming against a push that had ALREADY landed.
 *
 * `clientLog` is mocked to a no-op (mounting `NotificationsProvider` otherwise
 * schedules real fetch flushes at module eval — same convention as the
 * live-state hazard suites).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  SyncStatusIndicator,
  SyncStatusProvider,
} from "@plugins/primitives/plugins/sync-status/web";
import { useOptimisticResource } from "../internal/use-optimistic-resource";

const rowsResource = resourceDescriptor<number[]>(
  "test.optimistic-mutation.rows",
  z.array(z.number()),
  [],
);
const rowsKey = queryKeyFor(rowsResource.key, undefined);

const apply = (current: number[], n: number): number[] => [...current, n];
const isConfirmedBy = (serverData: number[], n: number): boolean => serverData.includes(n);
const sameTarget = (a: number, b: number): boolean => a === b;

/** A `mutate` whose promise the test resolves by hand, to order push vs resolve. */
function deferredMutate() {
  let release!: () => void;
  const mutate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  return { mutate, release: () => release() };
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
function useRows(mutate: (n: number) => Promise<void>, contentBased: boolean) {
  return useOptimisticResource<number[], number>(
    contentBased
      ? { resource: rowsResource, apply, mutate, isConfirmedBy, sameTarget }
      : { resource: rowsResource, apply, mutate },
  );
}

function mountHook(
  client: QueryClient,
  mutate: (n: number) => Promise<void>,
  contentBased = false,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>{children}</NotificationsProvider>
  );
  return renderHook(() => useRows(mutate, contentBased), { wrapper });
}

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

  it("a rejected mutate rolls the overlay back and surfaces the op in `failed`", async () => {
    const client = makeClient();
    const mutate = vi.fn(() => Promise.reject(new Error("nope")));
    const { result } = mountHook(client, mutate);

    await act(async () => {
      result.current.dispatch(2);
    });
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.pendingOps).toEqual([]);
    expect(result.current.saving).toBe(false);
  });
});
