/**
 * useLive over a typed-query value and a cursor-paged value, on a real
 * NotificationsProvider + QueryClient (the use-live.test.tsx harness):
 * authoritative values are driven with `client.setQueryData` on the exact tuple
 * the declaration's codec encodes — the same call a WS sub-ack makes.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { NotificationsClient } from "@plugins/primitives/plugins/live-state/web/testing";
import { liveValue } from "@plugins/network/plugins/live/core";
import { useLive } from "@plugins/network/plugins/live/web";

const Result = z.object({ n: z.number() });
const Query = z.object({ metric: z.string(), days: z.number().default(7) });
const Item = z.object({ id: z.string() });
const Meta = z.object({ total: z.number() });

let seq = 0;
const key = () => `test.use-live-query.${seq++}`;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
}

function mount<R>(client: QueryClient, useHook: () => R) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>
      {children}
    </NotificationsProvider>
  );
  const rendered = renderHook(useHook, { wrapper });
  const notifications = getNotificationsClient();
  if (!notifications) throw new Error("NotificationsClient not created");
  vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
  return { ...rendered, notifications };
}

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("useLive — typed-query value", () => {
  it("subscribes on the question's canonical tuple, and goes loading → ready", async () => {
    const v = liveValue(key(), { schema: Result, query: Query });
    const client = makeClient();
    const observe = vi.spyOn(NotificationsClient.prototype, "observe");
    const { result } = mount(client, () => useLive(v, { metric: "m" }));
    expect(result.current.status).toBe("loading");
    const tuple = { q: '{"days":7,"metric":"m"}' };
    expect(
      observe.mock.calls.filter(([k]) => k === v.key).map(([, p]) => p),
    ).toEqual([tuple]);
    observe.mockRestore();
    act(() => {
      client.setQueryData(queryKeyFor(v.key, tuple), { n: 3 });
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({ data: { n: 3 } });
  });

  it("a changed question is a new tuple: it shows loading", async () => {
    const v = liveValue(key(), { schema: Result, query: Query });
    const client = makeClient();
    client.setQueryData(queryKeyFor(v.key, v.query.encode({ metric: "a" })), {
      n: 1,
    });
    let metric = "a";
    const { result, rerender } = mount(client, () => useLive(v, { metric }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    metric = "b";
    rerender();
    expect(result.current.status).toBe("loading");
  });

  it("a refetch (an invalidate) keeps the previous answer on screen", async () => {
    const v = liveValue(key(), { schema: Result, query: Query });
    const client = makeClient();
    const tuple = v.query.encode({ metric: "m" });
    client.setQueryData(queryKeyFor(v.key, tuple), { n: 1 });
    const { result, notifications } = mount(client, () =>
      useLive(v, { metric: "m" }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let land: ((value: unknown) => void) | undefined;
    vi.spyOn(notifications, "fetchOverHttp").mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }) as never,
    );
    let refetched: Promise<void> | undefined;
    act(() => {
      refetched = result.current.refetch();
    });
    expect(result.current).toMatchObject({ status: "ready", data: { n: 1 } });
    await act(async () => {
      land!({ n: 2 });
      await refetched;
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: "ready", data: { n: 2 } }),
    );
  });

  it("null reads nothing", () => {
    const v = liveValue(key(), { schema: Result, query: Query });
    const client = makeClient();
    const observe = vi.spyOn(NotificationsClient.prototype, "observe");
    const { result } = mount(client, () => useLive(v, null));
    expect(result.current.status).toBe("loading");
    expect(observe.mock.calls.filter(([k]) => k === v.key)).toEqual([]);
    observe.mockRestore();
  });

  it("types: the question is the schema's input; it is required", () => {
    const v = liveValue(key(), { schema: Result, query: Query });
    // Never called — the assertions are the `@ts-expect-error`s.
    const useTypeOnly = () => {
      useLive(v, { metric: "m" });
      useLive(v, { metric: "m", days: 2 });
      useLive(v, null);
      // @ts-expect-error — a query value's question is required
      useLive(v);
      // @ts-expect-error — the wire tuple is not the question
      useLive(v, { q: "{}" });
    };
    expect(typeof useTypeOnly).toBe("function");
  });
});

describe("useLive — paged value", () => {
  function paged() {
    return liveValue(key(), {
      query: z.object({ metric: z.string() }),
      paged: { item: Item, id: "id", meta: Meta, limit: 3 },
    });
  }

  it("reads the first page at `first`, and loadMore grows the chain by the next cursor", async () => {
    const v = paged();
    const client = makeClient();
    const q = '{"metric":"m"}';
    client.setQueryData(queryKeyFor(v.key, { q, n: "2" }), {
      items: items("a", "b"),
      nextCursor: "c1",
      meta: { total: 4 },
    });
    const { result } = mount(client, () =>
      useLive(v, { metric: "m" }, { first: 2 }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current;
    if (first.status !== "ready") throw new Error("unreachable");
    expect(first.data).toEqual(items("a", "b"));
    expect(first.meta).toEqual({ total: 4 });
    expect(first.canGrow).toBe(true);

    act(() => first.loadMore());
    expect(result.current).toMatchObject({ status: "ready", growing: true });
    act(() => {
      client.setQueryData(queryKeyFor(v.key, { q, n: "3", c: "c1" }), {
        items: items("b", "c", "d"),
        nextCursor: null,
        meta: { total: 4 },
      });
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: "ready", growing: false }),
    );
    const grown = result.current;
    if (grown.status !== "ready") throw new Error("unreachable");
    // "b" shifted across the boundary: shown once.
    expect(grown.data).toEqual(items("a", "b", "c", "d"));
    expect(grown.canGrow).toBe(false);
    expect(grown.truncated).toBe(false);
  });

  it("a failed page is the error arm with every item already held as stale", async () => {
    const v = paged();
    const client = makeClient();
    const q = '{"metric":"m"}';
    client.setQueryData(queryKeyFor(v.key, { q, n: "3" }), {
      items: items("a", "b", "c"),
      nextCursor: "c1",
      meta: { total: 9 },
    });
    const { result } = mount(client, () => useLive(v, { metric: "m" }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      const r = result.current;
      if (r.status !== "ready") throw new Error("unreachable");
      r.loadMore();
    });
    await act(async () => {
      await client.prefetchQuery({
        queryKey: queryKeyFor(v.key, { q, n: "3", c: "c1" }),
        queryFn: () => Promise.reject(new Error("page failed")),
        staleTime: 0,
      });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    const r = result.current;
    if (r.status !== "error") throw new Error("unreachable");
    expect(r.error.message).toBe("page failed");
    expect(r.stale).toEqual(items("a", "b", "c"));
    expect(r.meta).toEqual({ total: 9 });
  });

  it("null reads nothing", () => {
    const v = paged();
    const client = makeClient();
    const observe = vi.spyOn(NotificationsClient.prototype, "observe");
    const { result } = mount(client, () => useLive(v, null));
    expect(result.current.status).toBe("loading");
    expect(observe.mock.calls.filter(([k]) => k === v.key)).toEqual([]);
    observe.mockRestore();
  });

  it("a first page larger than the declared limit throws", () => {
    const v = paged();
    const client = makeClient();
    expect(() =>
      mount(client, () => useLive(v, { metric: "m" }, { first: 4 })),
    ).toThrow(/first 4 is not an integer in 1..3/);
  });
});
