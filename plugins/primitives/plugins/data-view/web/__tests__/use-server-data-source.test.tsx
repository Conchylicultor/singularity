import { describe, expect, it, vi, beforeAll } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useServerDataSource } from "../internal/use-server-data-source";
import type { ServerDataSourceSpec, ServerPage } from "../../core";

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

const emptyView = { sort: [], filter: null, query: "" };

function pageOf(items: string[], nextCursor: string | null): ServerPage<string> {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

describe("useServerDataSource", () => {
  it("returns null when no spec is provided (in-memory path)", () => {
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, undefined),
      { wrapper },
    );
    expect(result.current).toBeNull();
  });

  it("fetches page 0 and accumulates rows", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a", "b"], "cur-1"));
    const spec: ServerDataSourceSpec<string> = { fetchPage, changeTick: 0 };
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.rows.length).toBe(2));
    expect(result.current?.rows).toEqual(["a", "b"]);
    expect(result.current?.hasMore).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, limit: 40 }),
    );
  });

  it("paginates via fetchMore using the server cursor", async () => {
    const fetchPage = vi
      .fn<ServerDataSourceSpec<string>["fetchPage"]>()
      .mockResolvedValueOnce(pageOf(["a"], "cur-1"))
      .mockResolvedValueOnce(pageOf(["b"], null));
    const spec: ServerDataSourceSpec<string> = { fetchPage, changeTick: 0 };
    const { result } = renderHook(
      () => useServerDataSource<string>(emptyView, spec),
      { wrapper },
    );
    await waitFor(() => expect(result.current?.rows).toEqual(["a"]));
    act(() => result.current?.fetchMore());
    await waitFor(() => expect(result.current?.rows).toEqual(["a", "b"]));
    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cur-1" }),
    );
    await waitFor(() => expect(result.current?.hasMore).toBe(false));
  });

  it("refetches loaded pages in place when changeTick changes", async () => {
    let token = "v1";
    const fetchPage = vi.fn(async () => pageOf([token], null));
    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) =>
        useServerDataSource<string>(emptyView, {
          fetchPage,
          changeTick: tick,
        }),
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

  it("restarts pagination from page 0 when the view changes", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a"], "cur-1"));
    const spec: ServerDataSourceSpec<string> = { fetchPage, changeTick: 0 };
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useServerDataSource<string>({ ...emptyView, query: q }, spec),
      { wrapper, initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current?.rows.length).toBe(1));
    rerender({ q: "hello" });
    await waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: "hello", cursor: null }),
      ),
    );
  });
});
