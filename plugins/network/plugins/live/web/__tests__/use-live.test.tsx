/**
 * useLive / useLiveRow over a real NotificationsProvider + QueryClient (the
 * live-state window-hooks.test.tsx harness): authoritative values are driven
 * with `client.setQueryData` on the exact tuple the codec encodes, the same
 * call a WS sub-ack makes.
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
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";
import {
  liveBoolean,
  liveText,
  or,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { useLive, useLiveRow } from "@plugins/network/plugins/live/web";

const Row = z.object({ id: z.string(), n: z.number(), on: z.boolean() });
type Row = z.infer<typeof Row>;

let seq = 0;
function collection() {
  return liveCollection(`test.use-live.${seq++}`, {
    row: Row,
    id: "id",
    filterable: { on: liveBoolean(), id: liveText() },
    sortable: ["n"],
    default: { orderBy: [["n", "asc"]], limit: 2 },
    maxLimit: 5,
  });
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i, on: true }));

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
  return rendered;
}

describe("useLive — window", () => {
  it("the default read subscribes on the declaration's default tuple and reports canGrow on a full window", async () => {
    const c = collection();
    const client = makeClient();
    client.setQueryData(queryKeyFor(c.key, { limit: "2" }), rows(2));

    const { result } = mount(client, () => useLive(c));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual(rows(2));
    expect(r.canGrow).toBe(true);
    expect(r.growing).toBe(false);
  });

  it("a filtered, sorted query subscribes on its canonical tuple", () => {
    const c = collection();
    const client = makeClient();
    mount(client, () =>
      useLive(c, { where: { on: true }, orderBy: [["n", "desc"]], limit: 3 }),
    );
    expect(
      client.getQueryState(
        queryKeyFor(c.key, {
          limit: "3",
          order: '[["n","desc"]]',
          where: '{"column":"on","op":"eq","operand":true}',
        }),
      ),
    ).toBeDefined();
  });

  it("an or tree subscribes on its canonical tuple — the same one for any spelling", () => {
    const c = collection();
    const client = makeClient();
    mount(client, () =>
      useLive(c, {
        where: or(
          { column: "id", op: "gt", operand: "r3" },
          { column: "on", op: "eq", operand: false },
        ),
      }),
    );
    mount(client, () =>
      useLive(c, {
        where: or(
          { column: "on", op: "eq", operand: false },
          or({ column: "id", op: "gt", operand: "r3" }),
        ),
      }),
    );
    const key = queryKeyFor(c.key, {
      limit: "2",
      where:
        '{"or":[{"column":"id","op":"gt","operand":"r3"},{"column":"on","op":"eq","operand":false}]}',
    });
    expect(client.getQueryState(key)).toBeDefined();
    expect(
      client
        .getQueryCache()
        .findAll()
        .filter((q) => (q.queryKey as unknown[])[0] === c.key),
    ).toHaveLength(1);
  });

  it("loadMore stays settled on the previous rows while the grown window loads, then settles on it; canGrow ends at maxLimit", async () => {
    const c = collection();
    const client = makeClient();
    client.setQueryData(queryKeyFor(c.key, { limit: "2" }), rows(2));

    const { result } = mount(client, () => useLive(c));
    await waitFor(() => expect(result.current.pending).toBe(false));

    act(() => {
      const r = result.current;
      if (r.pending) throw new Error("unreachable");
      r.loadMore();
    });
    // The limit-4 tuple has no value yet: still settled, on the old rows.
    const mid = result.current;
    if (mid.pending) throw new Error("grow must not flash pending");
    expect(mid.growing).toBe(true);
    expect(mid.data).toEqual(rows(2));
    expect(mid.canGrow).toBe(false);

    act(() => {
      client.setQueryData(queryKeyFor(c.key, { limit: "4" }), rows(4));
    });
    await waitFor(() => {
      const r = result.current;
      expect(!r.pending && !r.growing && r.data.length === 4).toBe(true);
    });
    const grown = result.current;
    if (grown.pending) throw new Error("unreachable");
    expect(grown.canGrow).toBe(true);

    // 4 + 2 clamps to maxLimit 5; a full 5-row window cannot grow further.
    act(() => grown.loadMore());
    act(() => {
      client.setQueryData(queryKeyFor(c.key, { limit: "5" }), rows(5));
    });
    await waitFor(() => {
      const r = result.current;
      expect(!r.pending && !r.growing && r.data.length === 5).toBe(true);
    });
    const end = result.current;
    if (end.pending) throw new Error("unreachable");
    expect(end.canGrow).toBe(false);
  });

  it("a short window cannot grow", async () => {
    const c = collection();
    const client = makeClient();
    client.setQueryData(queryKeyFor(c.key, { limit: "2" }), rows(1));
    const { result } = mount(client, () => useLive(c));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.canGrow).toBe(false);
  });
});

describe("useLive — groupBy", () => {
  const groups = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      value: i % 2 === 0,
      count: count - i,
    }));

  it("subscribes on the :groups tuple and goes pending → settled with paging handles", async () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, () =>
      useLive(c, { groupBy: "on", limit: 2 }),
    );
    expect(result.current.pending).toBe(true);
    act(() => {
      client.setQueryData(
        queryKeyFor(`${c.key}:groups`, { groupBy: "on", limit: "2" }),
        groups(2),
      );
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    // Typed: `on` is a boolean column, so a group's value is boolean | null.
    const value: boolean | null = r.data[0]!.value;
    expect(value).toBe(true);
    expect(r.data).toEqual(groups(2));
    expect(r.canGrow).toBe(true);
    expect(r.growing).toBe(false);
  });

  it("a where rides in the canonical group tuple", () => {
    const c = collection();
    const client = makeClient();
    mount(client, () => useLive(c, { groupBy: "on", where: { on: true } }));
    expect(
      client.getQueryState(
        queryKeyFor(`${c.key}:groups`, {
          groupBy: "on",
          limit: "50",
          where: '{"column":"on","op":"eq","operand":true}',
        }),
      ),
    ).toBeDefined();
  });

  it("loadMore stays settled on the previous groups while the grown tuple loads", async () => {
    const c = collection();
    const client = makeClient();
    client.setQueryData(
      queryKeyFor(`${c.key}:groups`, { groupBy: "on", limit: "2" }),
      groups(2),
    );
    const { result } = mount(client, () =>
      useLive(c, { groupBy: "on", limit: 2 }),
    );
    await waitFor(() => expect(result.current.pending).toBe(false));

    act(() => {
      const r = result.current;
      if (r.pending) throw new Error("unreachable");
      r.loadMore();
    });
    const mid = result.current;
    if (mid.pending) throw new Error("grow must not flash pending");
    expect(mid.growing).toBe(true);
    expect(mid.data).toEqual(groups(2));

    // One default group page (50) past 2, clamped to the group max (100).
    act(() => {
      client.setQueryData(
        queryKeyFor(`${c.key}:groups`, { groupBy: "on", limit: "52" }),
        groups(3),
      );
    });
    await waitFor(() => {
      const r = result.current;
      expect(!r.pending && !r.growing && r.data.length === 3).toBe(true);
    });
    const grown = result.current;
    if (grown.pending) throw new Error("unreachable");
    expect(grown.canGrow).toBe(false); // 3 < 52: every group is loaded
  });

  it("rejects an orderBy and a non-filterable column at the type level", () => {
    const c = collection();
    const client = makeClient();
    const ordered = { groupBy: "on", orderBy: [["n", "asc"]] } as const;
    const unfilterable = { groupBy: "n" } as const;
    // @ts-expect-error — a grouping has a fixed order
    const useOrdered = () => useLive(c, ordered);
    // @ts-expect-error — `n` is sortable but not filterable
    const useUnfilterable = () => useLive(c, unfilterable);
    expect(() => mount(client, useOrdered)).toThrow(/fixed order/);
    expect(() => mount(client, useUnfilterable)).toThrow(
      /not a filterable column/,
    );
  });
});

describe("useLive — ids", () => {
  it("an id set reads the :rows sibling on its canonical tuple, with no paging fields", async () => {
    const c = collection();
    const client = makeClient();
    client.setQueryData(
      queryKeyFor(`${c.key}:rows`, { ids: "r0,r1" }),
      rows(2),
    );
    const { result } = mount(client, () => useLive(c, { ids: ["r1", "r0"] }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual(rows(2));
    expect("canGrow" in r).toBe(false);
  });
});

describe("useLiveRow", () => {
  it("goes pending → found", async () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, () => useLiveRow(c, "r0"));
    expect(result.current.pending).toBe(true);
    act(() => {
      client.setQueryData(queryKeyFor(`${c.key}:rows`, { ids: "r0" }), rows(1));
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toEqual({
      pending: false,
      found: true,
      row: rows(1)[0],
    });
  });

  it("goes pending → not found when the server answers with no row", async () => {
    const c = collection();
    const client = makeClient();
    const { result } = mount(client, () => useLiveRow(c, "nope"));
    expect(result.current.pending).toBe(true);
    act(() => {
      client.setQueryData(queryKeyFor(`${c.key}:rows`, { ids: "nope" }), []);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toEqual({ pending: false, found: false });
  });
});

describe("a lookup-only collection", () => {
  const lookup = () =>
    liveCollection(`test.use-live.lookup-${seq++}`, { row: Row, id: "id" });

  it("useLiveRow and an id set read its :rows sibling", async () => {
    const c = lookup();
    const client = makeClient();
    const { result } = mount(client, () => ({
      row: useLiveRow(c, "r0"),
      set: useLive(c, { ids: ["r0"] }),
    }));
    expect(result.current.row.pending).toBe(true);
    act(() => {
      client.setQueryData(queryKeyFor(`${c.key}:rows`, { ids: "r0" }), rows(1));
    });
    await waitFor(() => expect(result.current.row.pending).toBe(false));
    expect(result.current.row).toEqual({
      pending: false,
      found: true,
      row: rows(1)[0],
    });
    const set = result.current.set;
    if (set.pending) throw new Error("unreachable");
    expect(set.data).toEqual(rows(1));
  });

  it("types: a list read of it is a tsc error — it declares no order to list in", () => {
    const c = lookup();
    // Never called — the assertions are the `@ts-expect-error`s.
    // @ts-expect-error — no default window
    const useWhole = () => useLive(c);
    // @ts-expect-error — no window to filter
    const useWhere = () => useLive(c, { where: { id: "r0" } });
    // @ts-expect-error — no groupings
    const useGrouped = () => useLive(c, { groupBy: "id" });
    expect([useWhole, useWhere, useGrouped]).toHaveLength(3);
  });
});

const Unread = z.object({ errors: z.number(), warnings: z.number() });

describe("useLive — value", () => {
  it("goes pending → settled on the param-less tuple", async () => {
    const v = liveValue(`test.use-live.value.${seq++}`, { schema: Unread });
    const client = makeClient();
    const { result } = mount(client, () => useLive(v));
    expect(result.current.pending).toBe(true);
    act(() => {
      client.setQueryData(queryKeyFor(v.key, {}), { errors: 1, warnings: 2 });
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual({ errors: 1, warnings: 2 });
  });

  it("a parameterized value subscribes on its params tuple", async () => {
    const v = liveValue(`test.use-live.value.${seq++}`, {
      schema: Unread,
      params: ["scope"],
    });
    const client = makeClient();
    client.setQueryData(queryKeyFor(v.key, { scope: "a" }), {
      errors: 0,
      warnings: 5,
    });
    const { result } = mount(client, () => useLive(v, { scope: "a" }));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it("a hydrated (boot-snapshot) value is settled on its first render", () => {
    const v = liveValue(`test.use-live.value.${seq++}`, {
      schema: Unread,
      preload: "boot",
    });
    expect(v.defaultParams).toEqual({});
    const client = makeClient();
    // What the boot task does before first paint: seed the default tuple.
    client.setQueryData(queryKeyFor(v.key, v.defaultParams!), {
      errors: 3,
      warnings: 0,
    });
    const seen: boolean[] = [];
    mount(client, () => {
      const r = useLive(v);
      seen.push(r.pending);
      return r;
    });
    expect(seen[0]).toBe(false);
  });

  it("no placeholder: a never-loaded value makes no HTTP fetch on mount (the WS fills it)", () => {
    const v = liveValue(`test.use-live.value.${seq++}`, { schema: Unread });
    const client = makeClient();
    mount(client, () => useLive(v));
    const state = client.getQueryState(queryKeyFor(v.key, {}));
    expect(state?.data).toBeUndefined();
    expect(state?.dataUpdatedAt).toBe(0);
    expect(state?.fetchStatus).toBe("idle");
  });

  it('"boot-and-keep" survives past gcTime after unmount; "boot" does not', async () => {
    const kept = liveValue(`test.use-live.value.${seq++}`, {
      schema: Unread,
      preload: "boot-and-keep",
    });
    const plain = liveValue(`test.use-live.value.${seq++}`, {
      schema: Unread,
      preload: "boot",
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: 5 },
      },
    });
    for (const v of [kept, plain]) {
      client.setQueryData(queryKeyFor(v.key, {}), { errors: 0, warnings: 0 });
    }
    const a = mount(client, () => useLive(kept));
    const b = mount(client, () => useLive(plain));
    a.unmount();
    b.unmount();
    await waitFor(() =>
      expect(client.getQueryState(queryKeyFor(plain.key, {}))).toBeUndefined(),
    );
    expect(client.getQueryState(queryKeyFor(kept.key, {}))?.data).toEqual({
      errors: 0,
      warnings: 0,
    });
  });

  it("types: params are required iff declared; preload is never beside params", () => {
    const bare = liveValue(`test.use-live.value.${seq++}`, { schema: Unread });
    const keyed = liveValue(`test.use-live.value.${seq++}`, {
      schema: Unread,
      params: ["id"],
    });
    // Never called — the assertions are the `@ts-expect-error`s.
    const useTypeOnly = () => {
      useLive(bare);
      // @ts-expect-error — a param-less value takes no params
      useLive(bare, { id: "x" });
      useLive(keyed, { id: "x" });
      // @ts-expect-error — a parameterized value's params are required
      useLive(keyed);
      // @ts-expect-error — only the declared names
      useLive(keyed, { other: "x" });
      // With the origin overloads the error lands on the call's first line, so
      // the call stays on one line.
      // prettier-ignore
      // @ts-expect-error — a parameterized value cannot be preloaded
      liveValue("test.use-live.never", { schema: Unread, params: ["id"], preload: "boot" });
    };
    expect(typeof useTypeOnly).toBe("function");
  });

  it("a parameterized value refuses a preload at runtime too (untyped callers)", () => {
    expect(() =>
      liveValue("test.use-live.bad", {
        schema: Unread,
        params: ["id"],
        preload: "boot" as never,
      }),
    ).toThrow(/cannot be preloaded/);
  });
});
