/**
 * useLiveScroll over a real NotificationsProvider + QueryClient: each segment
 * is a window tuple, driven with `client.setQueryData` on the exact tuple its
 * codec encodes (the same call a WS sub-ack makes), and a read failure through
 * the one HTTP path (`fetchOverHttp`), as `use-live.test.tsx` does.
 *
 * - loading until the head settles, then never again: a grow keeps the old
 *   rows rendered (`growing`) until the grown window settles;
 * - `$key` is split off every row;
 * - at `maxLimit` a loadMore splits the tail at row `maxLimit − step`;
 * - a failing tail replacement keeps its rows, with its own retry (not loadMore);
 * - a query change with the same `resetKey` keeps the previous rows until the
 *   new head settles; any other change starts over, loading.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import {
  liveCollection,
  type LiveWindowBounds,
} from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import {
  useLiveScroll,
  type LiveScrollQuery,
  type LiveScrollResult,
} from "../internal/use-live-scroll";

const Row = z.object({ id: z.string(), n: z.number(), title: z.string() });
type Row = z.infer<typeof Row>;

let seq = 0;
function collection() {
  return liveCollection(`test.use-live-scroll.${seq++}`, {
    row: Row,
    id: "id",
    filterable: { title: liveText() },
    sortable: ["n"],
    default: { orderBy: [["n", "asc"]], limit: 2 },
    maxLimit: 6,
    scroll: true,
  });
}
type C = ReturnType<typeof collection>;

const keyOf = (n: number) => JSON.stringify([String(n), `r${n}`]);
/** Wire rows n ∈ [from, to), each with its server-minted `$key`. */
const wire = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => ({
    id: `r${from + i}`,
    n: from + i,
    title: "t",
    $key: keyOf(from + i),
  }));
const rows = (from: number, to: number): Row[] =>
  wire(from, to).map(({ $key: _k, ...r }) => r);

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
}

function tuple(
  c: C,
  limit: number,
  bounds: LiveWindowBounds = {},
  query: LiveScrollQuery<C["filterable"], "n"> = {},
) {
  return queryKeyFor(
    c.key,
    c.window.window.encode({ ...query, limit }, bounds),
  );
}

function mount(
  client: QueryClient,
  c: C,
  initial: {
    query: LiveScrollQuery<C["filterable"], "n"> | null;
    resetKey?: string;
  },
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>
      {children}
    </NotificationsProvider>
  );
  const rendered = renderHook(
    (p: {
      query: LiveScrollQuery<C["filterable"], "n"> | null;
      resetKey?: string;
    }) =>
      useLiveScroll(
        c,
        p.query,
        p.resetKey === undefined ? {} : { resetKey: p.resetKey },
      ),
    { wrapper, initialProps: initial },
  );
  const notifications = getNotificationsClient();
  if (!notifications) throw new Error("NotificationsClient not created");
  vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
  return { ...rendered, notifications };
}

function settled<Row>(
  r: LiveScrollResult<Row>,
): Extract<LiveScrollResult<Row>, { status: "ready" }> {
  if (r.status !== "ready") throw new Error("expected a settled scroll");
  return r;
}

describe("useLiveScroll", () => {
  it("a null query reads nothing and stays loading", () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, c, { query: null });
    expect(result.current).toEqual({ status: "loading" });
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it("is loading until the head settles; rows come without their $key", async () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, c, { query: {} });
    expect(result.current.status).toBe("loading");
    act(() => {
      client.setQueryData(tuple(c, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const r = settled(result.current);
    expect(r.rows).toEqual(rows(0, 2));
    expect(r.canGrow).toBe(true);
    expect(r.exhausted).toBe(false);
    expect(r.growing).toBe(false);
  });

  it("grows by a step to maxLimit without ever flashing loading, then splits the tail", async () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, c, { query: {} });
    act(() => {
      client.setQueryData(tuple(c, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    for (const limit of [4, 6]) {
      act(() => settled(result.current).loadMore());
      const mid = settled(result.current);
      expect(mid.growing).toBe(true);
      expect(mid.canGrow).toBe(false);
      expect(mid.rows).toEqual(rows(0, limit - 2));
      act(() => {
        client.setQueryData(tuple(c, limit), wire(0, limit));
      });
      await waitFor(() =>
        expect(settled(result.current).rows).toHaveLength(limit),
      );
    }
    // At maxLimit: the split at row M − H = 4 (n = 3).
    act(() => settled(result.current).loadMore());
    expect(settled(result.current).growing).toBe(true);
    act(() => {
      client.setQueryData(tuple(c, 6, { until: keyOf(3) }), wire(0, 4));
      client.setQueryData(tuple(c, 4, { after: keyOf(3) }), wire(4, 8));
    });
    await waitFor(() =>
      expect(settled(result.current).rows).toEqual(rows(0, 8)),
    );
    const r = settled(result.current);
    expect(r.growing).toBe(false);
    expect(r.canGrow).toBe(true);
  });

  it("a failing tail replacement keeps the old rows, with its own retry — never loadMore", async () => {
    const c = collection();
    const client = makeClient();
    const { result, notifications } = mount(client, c, { query: {} });
    act(() => {
      client.setQueryData(tuple(c, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => settled(result.current).loadMore());
    const fetch = vi
      .spyOn(notifications, "fetchOverHttp")
      .mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await expect(
        client
          .getQueryCache()
          .find({ queryKey: tuple(c, 4), exact: true })!
          .fetch(),
      ).rejects.toThrow("boom");
    });
    await waitFor(() =>
      expect(settled(result.current).segmentErrors).toHaveLength(1),
    );
    const r = settled(result.current);
    expect(r.rows).toEqual(rows(0, 2));
    // No spinner beside the failure: nothing is loading any more.
    expect(r.growing).toBe(false);
    const [failure] = r.segmentErrors;
    expect(failure!.blocksPaging).toBe(true);
    expect(failure!.afterRowId).toBeNull();
    expect(failure!.error.message).toBe("boom");
    expect(failure!.retry).not.toBe(r.loadMore);

    fetch.mockResolvedValueOnce(wire(0, 4));
    await act(async () => {
      failure!.retry();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(settled(result.current).rows).toEqual(rows(0, 4)),
    );
    expect(settled(result.current).segmentErrors).toEqual([]);
  });

  it("another collection whose query encodes alike starts over: a plan is one collection's", async () => {
    const a = collection();
    const b = collection();
    const client = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NotificationsProvider queryClient={client}>
        {children}
      </NotificationsProvider>
    );
    const { result, rerender } = renderHook(
      (p: { c: C }) => useLiveScroll(p.c, {}, { resetKey: "same" }),
      { wrapper, initialProps: { c: a } },
    );
    act(() => {
      client.setQueryData(tuple(a, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => settled(result.current).loadMore());
    act(() => {
      client.setQueryData(tuple(a, 4), wire(0, 4));
    });
    await waitFor(() => expect(settled(result.current).rows).toHaveLength(4));
    // Same query, same resetKey — another collection: loading on ITS head,
    // never `a`'s grown plan read against `b`.
    rerender({ c: b });
    expect(result.current.status).toBe("loading");
    expect(
      client.getQueryCache().find({ queryKey: tuple(b, 4), exact: true }),
    ).toBeUndefined();
    act(() => {
      client.setQueryData(tuple(b, 2), wire(7, 9));
    });
    await waitFor(() =>
      expect(settled(result.current).rows).toEqual(rows(7, 9)),
    );
  });

  it("a search undone before its head settles restores the scroll still on screen", async () => {
    const c = collection();
    const client = makeClient();
    const { result, rerender } = mount(client, c, {
      query: {},
      resetKey: "sort:n",
    });
    act(() => {
      client.setQueryData(tuple(c, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => settled(result.current).loadMore());
    act(() => {
      client.setQueryData(tuple(c, 4), wire(0, 4));
    });
    await waitFor(() => expect(settled(result.current).rows).toHaveLength(4));
    rerender({
      query: { where: { title: { contains: "x" } } },
      resetKey: "sort:n",
    });
    expect(settled(result.current).rows).toEqual(rows(0, 4));
    // Typed back: the grown scroll is current again, not restarted at one step.
    rerender({ query: {}, resetKey: "sort:n" });
    const r = settled(result.current);
    expect(r.rows).toEqual(rows(0, 4));
    expect(r.canGrow).toBe(true);
  });

  it("a query change under the same resetKey keeps the previous rows until the new head settles", async () => {
    const c = collection();
    const client = makeClient();
    const { result, rerender } = mount(client, c, {
      query: {},
      resetKey: "sort:n",
    });
    act(() => {
      client.setQueryData(tuple(c, 2), wire(0, 2));
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const searched = { where: { title: { contains: "x" } } } as const;
    rerender({ query: searched, resetKey: "sort:n" });
    const kept = settled(result.current);
    expect(kept.rows).toEqual(rows(0, 2));
    expect(kept.canGrow).toBe(false);

    act(() => {
      client.setQueryData(tuple(c, 2, {}, searched), wire(5, 6));
    });
    await waitFor(() =>
      expect(settled(result.current).rows).toEqual(rows(5, 6)),
    );
    expect(settled(result.current).exhausted).toBe(true);

    // Another reset key: a new scroll, loading until its head settles.
    rerender({ query: { orderBy: [["n", "desc"]] }, resetKey: "sort:n-desc" });
    expect(result.current.status).toBe("loading");
  });
});
