/**
 * The load-bearing assumption behind the pending/error gate (D1): React Query
 * v5's `setQueryData` **success** action RESETS `state.error`. If it did not, a
 * WS push after a transient failure would re-settle `pending: false` while
 * `q.error` stayed set — and `useResource` would hand back a settled result next
 * to a live error, exactly the state the type change makes unrepresentable. This
 * suite VERIFIES that reset against a REAL `QueryClient` (not a mock), plus the
 * three derived properties of the widened gate:
 *
 *   - a first-load failure ⇒ `pending: true`, `error` set, `stale === undefined`;
 *   - a failure AFTER a successful load ⇒ `pending: true`, `error` set,
 *     `stale` = the last good value, and `data` is absent from the result;
 *   - a subsequent `setQueryData` (the WS push path) clears the error and
 *     re-settles `pending: false`;
 *   - with `{ select }`, `stale` carries the SELECTED slice, not the raw payload.
 *
 * Harness: a real `NotificationsProvider` over a real `QueryClient`. The ONE HTTP
 * write path — `NotificationsClient.fetchOverHttp`, which backs `useResource`'s
 * `queryFn` — is spied so `refetch()` is a deterministic way to drive an error
 * into `q.error` without a live server. Authoritative pushes are driven directly
 * with `client.setQueryData`, the same call the WS sub-ack makes. React Query's
 * observer notification is batched (async), so state transitions are awaited via
 * `waitFor` rather than read synchronously.
 *
 * `clientLog` is mocked to a no-op (mounting `NotificationsProvider` otherwise
 * schedules real fetch flushes at module eval — same convention as the
 * live-state hazard suites).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

const rowsResource = resourceDescriptor<number[]>(
  "test.error-gate.rows",
  z.array(z.number()),
  [],
);
const rowsKey = queryKeyFor(rowsResource.key, undefined);

function makeClient(): QueryClient {
  // retry:false so a rejected queryFn sets `state.error` immediately; no
  // auto-refetch so `fetchOverHttp` runs ONLY on our explicit `refetch()`.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
}

function mount<R>(client: QueryClient, useHook: () => R) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>{children}</NotificationsProvider>
  );
  const rendered = renderHook(useHook, { wrapper });
  const notifications = getNotificationsClient();
  if (!notifications) throw new Error("NotificationsClient not created");
  // Suppress the cold-start HTTP primer so the only path that runs
  // `fetchOverHttp` is our explicit `refetch()`.
  vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
  return { ...rendered, notifications };
}

/** Force `q.error` via the queryFn (`fetchOverHttp`) rejecting once. */
async function failNextLoad(
  notifications: NonNullable<ReturnType<typeof getNotificationsClient>>,
  result: { current: { refetch: () => Promise<void> } },
  message: string,
): Promise<void> {
  vi.spyOn(notifications, "fetchOverHttp").mockRejectedValue(new Error(message));
  await act(async () => {
    // The mocked rejection IS the scenario under test, so swallow exactly that
    // one and rethrow anything else (a bare `.catch(() => {})` would hide a
    // genuine failure in the hook).
    await result.current.refetch().catch((err: unknown) => {
      if (err instanceof Error && err.message === message) return;
      throw err;
    });
  });
}

describe("useResource — pending absorbs error (D1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("first-load failure ⇒ pending, error set, stale undefined", async () => {
    const client = makeClient();
    const { result, notifications } = mount(client, () => useResource(rowsResource));
    await failNextLoad(notifications, result, "boom");

    await waitFor(() => {
      const r = result.current;
      if (!r.pending) throw new Error("still settled");
      expect(r.error?.message).toBe("boom");
    });
    const r = result.current;
    if (!r.pending) throw new Error("unreachable");
    expect(r.error?.message).toBe("boom");
    expect(r.stale).toBeUndefined();
  });

  it("failure after a successful load ⇒ pending, error set, stale = last good, data absent", async () => {
    const client = makeClient();
    const { result, notifications } = mount(client, () => useResource(rowsResource));

    act(() => {
      client.setQueryData(rowsKey, [1, 2, 3]);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    // Narrow a LOCAL, never `result.current` itself: narrowing the property
    // access pins it to the settled arm for the rest of the block, and the
    // post-failure reads below would then be typed against the wrong arm.
    const beforeFailure = result.current;
    if (beforeFailure.pending) throw new Error("unreachable — should have settled");
    expect(beforeFailure.data).toEqual([1, 2, 3]);

    await failNextLoad(notifications, result, "late");

    await waitFor(() => expect(result.current.pending).toBe(true));
    const r = result.current;
    if (!r.pending) throw new Error("unreachable");
    expect(r.error?.message).toBe("late");
    expect(r.stale).toEqual([1, 2, 3]);
    // The pending arm exposes no `data` — a stale value can never decide.
    expect("data" in r).toBe(false);
  });

  it("a subsequent setQueryData (WS push) clears the error and re-settles — the RQ assumption D1 rests on", async () => {
    const client = makeClient();
    const { result, notifications } = mount(client, () => useResource(rowsResource));

    act(() => {
      client.setQueryData(rowsKey, [1]);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    await failNextLoad(notifications, result, "boom");
    await waitFor(() => expect(result.current.pending).toBe(true));
    // The load-bearing RQ behavior, asserted against the real QueryClient:
    // the error is live BEFORE the push...
    expect(client.getQueryState(rowsKey)?.error).toBeTruthy();

    act(() => {
      client.setQueryData(rowsKey, [1, 2]);
    });
    // ...and the success action RESET it to null — synchronously, on the cache.
    expect(client.getQueryState(rowsKey)?.error).toBeNull();

    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable — push should have re-settled");
    expect(r.data).toEqual([1, 2]);
  });

  it("with select, stale carries the selected slice, not the raw payload", async () => {
    const client = makeClient();
    const { result, notifications } = mount(client, () =>
      useResource(rowsResource, undefined, { select: (rows) => rows.length }),
    );

    act(() => {
      client.setQueryData(rowsKey, [10, 20, 30]);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const beforeFailure = result.current;
    if (beforeFailure.pending) throw new Error("unreachable — should have settled");
    expect(beforeFailure.data).toBe(3);

    await failNextLoad(notifications, result, "boom");

    await waitFor(() => expect(result.current.pending).toBe(true));
    const r = result.current;
    if (!r.pending) throw new Error("unreachable");
    // The SELECTED slice (length), not the raw [10,20,30].
    expect(r.stale).toBe(3);
  });
});
