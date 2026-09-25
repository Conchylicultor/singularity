import { describe, expect, it, vi, beforeAll } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useServerDataSource } from "../internal/use-server-data-source";
import { defineDataView } from "../../core";
import {
  clause,
  FilterError,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { ServerDataSourceSpec, ServerPage } from "../../core";

const TEST_VIEW = defineDataView("test-view");

beforeAll(() => {
  // jsdom lacks IntersectionObserver; the hook constructs one in an effect.
  class FakeIO {
    observe(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("IntersectionObserver", FakeIO);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

const emptyView = {
  sort: [],
  filter: { kind: "ok" as const, filter: undefined },
};

/** A spec over one declared text column, searchable. */
function specOf(
  fetchPage: ServerDataSourceSpec<string>["fetchPage"],
  changeTick: unknown = 0,
): ServerDataSourceSpec<string> {
  return {
    fetchPage,
    changeTick,
    filterable: { title: liveText() },
    searchable: ["title"],
  };
}

function pageOf(
  items: string[],
  nextCursor: string | null,
): ServerPage<string> {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

describe("useServerDataSource", () => {
  it("returns null when no spec is provided (in-memory path)", () => {
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, undefined, TEST_VIEW),
      { wrapper },
    );
    expect(result.current).toBeNull();
  });

  it("fetches page 0 and accumulates rows", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a", "b"], "cur-1"));
    const spec = specOf(fetchPage);
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec, TEST_VIEW),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.rows.length).toBe(2));
    expect(result.current?.rows).toEqual(["a", "b"]);
    expect(result.current?.scroll.hasNextPage).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 40 }),
    );
  });

  it("paginates via scroll.retry using the server cursor", async () => {
    const fetchPage = vi
      .fn<ServerDataSourceSpec<string>["fetchPage"]>()
      .mockResolvedValueOnce(pageOf(["a"], "cur-1"))
      .mockResolvedValueOnce(pageOf(["b"], null));
    const spec = specOf(fetchPage);
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec, TEST_VIEW),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["a"]));
    act(() => result.current?.scroll.retry());
    await waitFor(() => expect(result.current?.rows).toEqual(["a", "b"]));
    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cur-1" }),
    );
    await waitFor(() => expect(result.current?.scroll.hasNextPage).toBe(false));
  });

  it("refetches loaded pages in place when changeTick changes", async () => {
    let token = "v1";
    const fetchPage = vi.fn(async () => pageOf([token], null));
    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) =>
        useServerDataSource<string>(
          emptyView,
          specOf(fetchPage, tick),
          TEST_VIEW,
        ),
      { wrapper, initialProps: { tick: 0 } },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["v1"]));
    expect(fetchPage).toHaveBeenCalledTimes(1);

    token = "v2";
    rerender({ tick: 1 });
    await waitFor(() => expect(result.current?.rows).toEqual(["v2"]));
    // Same query key (view unchanged) → an in-place refetch, not a fresh paginate.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("keys the page cache by storageKey + sourceScope + view state", async () => {
    // The cache is `staleTime: Infinity`, so the key must carry the surface
    // identity — two surfaces (or two sources) with structurally-equal view
    // state must never share pages fetched by a different `fetchPage`.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const scopedWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const fetchPage = vi.fn(async () => pageOf(["a"], null));
    const spec = specOf(fetchPage);
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec, TEST_VIEW, "queue"),
      { wrapper: scopedWrapper },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["a"]));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.slice(0, 3)).toEqual([
      "data-view-server",
      "test-view",
      "queue",
    ]);
    // Trailing segment is the stable-stringified sort/filter/query view state.
    expect(typeof keys[0]![3]).toBe("string");
  });

  it("defaults sourceScope to the empty string (single-source path)", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const scopedWrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const fetchPage = vi.fn(async () => pageOf(["a"], null));
    const spec = specOf(fetchPage);
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec, TEST_VIEW),
      { wrapper: scopedWrapper },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["a"]));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys[0]!.slice(0, 3)).toEqual(["data-view-server", "test-view", ""]);
  });

  it("restarts pagination from page 0 when the filter changes", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a"], "cur-1"));
    const spec = specOf(fetchPage);
    const hello = clause("title", "contains", "hello");
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) =>
        useServerDataSource<string>(
          {
            sort: [],
            filter: { kind: "ok", filter: on ? hello : undefined },
          },
          spec,
          TEST_VIEW,
        ),
      { wrapper, initialProps: { on: false } },
    );
    await waitFor(() => expect(result.current?.rows.length).toBe(1));
    rerender({ on: true });
    await waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: hello, cursor: null }),
      ),
    );
  });

  it("an unsendable filter fetches nothing and reports the error", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a"], null));
    const error = new FilterError("filter: 51 clauses (max 50)");
    const { result } = renderHook(
      () =>
        useServerDataSource<string>(
          { sort: [], filter: { kind: "error", error } },
          specOf(fetchPage),
          TEST_VIEW,
        ),
      { wrapper },
    );
    expect(result.current?.error).toBe(error);
    expect(result.current?.loading).toBe(false);
    expect(result.current?.rows).toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("a failed first page is an error, never an empty list", async () => {
    const fetchPage = vi.fn(async (): Promise<ServerPage<string>> => {
      throw new Error('400 filter: "nope" is not a filterable column');
    });
    const { result } = renderHook(
      () =>
        useServerDataSource<string>(emptyView, specOf(fetchPage), TEST_VIEW),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.error).not.toBeNull());
    expect(result.current?.error?.message).toContain("nope");
    expect(result.current?.rows).toEqual([]);
  });
  // The DataView host holds paging while the loaded tail is folded (see
  // `isTailFolded`): the sentinel goes away, and comes back when a fold opens.
  it("holdPaging withholds the next page (no sentinel) until it lifts", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a", "old"], "cur-1"));
    const spec = specOf(fetchPage);
    const { result, rerender } = renderHook(
      ({ folded }: { folded: boolean }) =>
        useServerDataSource<string>(emptyView, spec, TEST_VIEW, "", {
          holdPaging: (rows) => folded && rows.at(-1) === "old",
        }),
      { wrapper, initialProps: { folded: true } },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["a", "old"]));
    // Tail folded ⇒ the handle says there is nothing to fetch, so the footer
    // renders no sentinel and the observer never fires.
    expect(result.current?.scroll.hasNextPage).toBe(false);

    // A fold opens ⇒ the hold lifts and the sentinel is back.
    rerender({ folded: false });
    expect(result.current?.scroll.hasNextPage).toBe(true);
  });
});
