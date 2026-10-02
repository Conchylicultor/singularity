/**
 * `useQueryResource` / `useInfiniteQueryResource` — a plain TanStack query read
 * as a `ResourceResult`, against a real `QueryClient`:
 *
 *   - loading until the value lands, then ready;
 *   - a failure is the error arm, classified (endpoint 404 → not-found, other
 *     status → loader-failed, no answer → transport, schema → client-outdated);
 *   - a failed refetch keeps the last value as `stale`; a refetch heals it;
 *   - the dependent form: the dependency's loading / failure stands in until
 *     it has a value, which then keys the query;
 *   - the paged form: pages as data, canGrow / growing / loadMore, and a failed
 *     next page keeps the pages already held as `stale`.
 */

import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod";
import { EndpointError } from "@plugins/infra/plugins/endpoints/web";
import {
  ResourceError,
  useInfiniteQueryResource,
  useQueryResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";

function wrapper(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useQueryResource", () => {
  it("is loading until the value lands, then ready", async () => {
    const d = deferred<number>();
    const { result } = renderHook(
      () => useQueryResource({ queryKey: ["n"], queryFn: () => d.promise }),
      { wrapper: wrapper() },
    );
    expect(result.current.status).toBe("loading");
    await act(async () => d.resolve(7));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const r = result.current;
    expect(r.status === "ready" && r.data).toBe(7);
  });

  it.each([
    ["an endpoint 404", () => new EndpointError(404, "gone"), "not-found"],
    [
      "another endpoint status",
      () => new EndpointError(500, "boom"),
      "loader-failed",
    ],
    ["no answer", () => new TypeError("Failed to fetch"), "transport"],
    [
      "a schema rejection",
      () => z.number().safeParse("x").error!,
      "client-outdated",
    ],
  ] as const)("classifies %s", async (_name, make, kind) => {
    const { result } = renderHook(
      () =>
        useQueryResource({
          queryKey: ["fail", kind],
          queryFn: (): Promise<number> => Promise.reject(make()),
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    const r = result.current;
    if (r.status !== "error") throw new Error("unreachable");
    expect(r.error).toBeInstanceOf(ResourceError);
    expect(r.error.kind).toBe(kind);
    expect(r.stale).toBeUndefined();
  });

  it("keeps the last value as stale when a refetch fails, and a refetch heals it", async () => {
    let call = 0;
    const { result } = renderHook(
      () =>
        useQueryResource({
          queryKey: ["flaky"],
          queryFn: () => {
            call += 1;
            if (call === 2)
              return Promise.reject(new EndpointError(503, "busy"));
            return Promise.resolve(call);
          },
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe("error"));
    const failed = result.current;
    if (failed.status !== "error") throw new Error("unreachable");
    expect(failed.stale).toBe(1);
    expect(failed.error.kind).toBe("loader-failed");
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const healed = result.current;
    expect(healed.status === "ready" && healed.data).toBe(3);
  });

  it("is memoized: a re-render with nothing new keeps the result's identity", async () => {
    const { result, rerender } = renderHook(
      () => useQueryResource({ queryKey: ["memo"], queryFn: () => 1 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useQueryResource — dependent form", () => {
  const refetch = () => Promise.resolve();

  it("stands on the dependency's loading arm, then keys the query by its value", async () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ dep }: { dep: ResourceResult<string> }) =>
        useQueryResource(dep, (rev) => ({
          queryKey: ["dep", rev],
          queryFn: () => {
            seen.push(rev);
            return Promise.resolve(`answer@${rev}`);
          },
        })),
      {
        wrapper: wrapper(),
        initialProps: { dep: { status: "loading", refetch } },
      },
    );
    expect(result.current.status).toBe("loading");
    expect(seen).toEqual([]);
    rerender({ dep: { status: "ready", data: "r1", refetch } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const r = result.current;
    expect(r.status === "ready" && r.data).toBe("answer@r1");
    expect(seen).toEqual(["r1"]);
  });

  it("is the dependency's failure when it failed before ever landing — never loading forever", () => {
    const error = new ResourceError("transport", "socket down", null);
    const { result } = renderHook(
      () =>
        useQueryResource(
          { status: "error", error, refetch } as ResourceResult<string>,
          (rev) => ({ queryKey: ["dep-fail", rev], queryFn: () => 1 }),
        ),
      { wrapper: wrapper() },
    );
    const r = result.current;
    if (r.status !== "error")
      throw new Error(`expected error, got ${r.status}`);
    expect(r.error).toBe(error);
  });

  it("keys by the dependency's stale value when it failed after landing", async () => {
    const error = new ResourceError("transport", "socket down", null);
    const { result } = renderHook(
      () =>
        useQueryResource(
          {
            status: "error",
            error,
            stale: "r0",
            refetch,
          } as ResourceResult<string>,
          (rev) => ({
            queryKey: ["dep-stale", rev],
            queryFn: () => Promise.resolve(`answer@${rev}`),
          }),
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const r = result.current;
    expect(r.status === "ready" && r.data).toBe("answer@r0");
  });
});

describe("useInfiniteQueryResource", () => {
  type Page = { items: number[]; next: number | null };

  it("reads pages as data with canGrow / growing / loadMore, and a failed next page keeps them as stale", async () => {
    const second = deferred<Page>();
    const { result } = renderHook(
      () =>
        useInfiniteQueryResource({
          queryKey: ["pages"],
          queryFn: ({ pageParam }: { pageParam: number }): Promise<Page> =>
            pageParam === 0
              ? Promise.resolve({ items: [1, 2], next: 1 })
              : second.promise,
          initialPageParam: 0,
          getNextPageParam: (last: Page) => last.next ?? undefined,
        }),
      { wrapper: wrapper() },
    );
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current;
    if (first.status !== "ready") throw new Error("unreachable");
    expect(first.data).toEqual([{ items: [1, 2], next: 1 }]);
    expect(first.canGrow).toBe(true);
    expect(first.growing).toBe(false);

    act(() => first.loadMore());
    await waitFor(() => {
      const r = result.current;
      expect(r.status === "ready" && r.growing).toBe(true);
    });
    const mid = result.current;
    expect(mid.status === "ready" && mid.canGrow).toBe(false);

    await act(async () => second.reject(new EndpointError(500, "page 2")));
    await waitFor(() => expect(result.current.status).toBe("error"));
    const failed = result.current;
    if (failed.status !== "error") throw new Error("unreachable");
    expect(failed.stale).toEqual([{ items: [1, 2], next: 1 }]);
    expect(failed.error.kind).toBe("loader-failed");
  });

  it("ends canGrow when the server names no next page", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteQueryResource({
          queryKey: ["one-page"],
          queryFn: (): Promise<Page> =>
            Promise.resolve({ items: [1], next: null }),
          initialPageParam: 0,
          getNextPageParam: (last: Page) => last.next ?? undefined,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const r = result.current;
    expect(r.status === "ready" && r.canGrow).toBe(false);
  });
});
