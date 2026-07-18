/**
 * useWindowResource / usePointResource / usePointResources — the params-tuple
 * identity contract: the hooks must subscribe on EXACTLY the canonical tuple
 * the codec (and therefore boot hydration) produces, and the point hook must
 * narrow the 0-or-1-element payload to row-or-null while preserving the
 * ResourceResult discriminated union (no `error` on the settled arm).
 *
 * Harness: a real NotificationsProvider over a real QueryClient (the
 * use-resource-error-gate.test.tsx convention — clientLog mocked, the
 * cold-start HTTP primer suppressed). Authoritative values are driven with
 * `client.setQueryData`, the same call the WS sub-ack makes.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({ clientLog: () => {} }));

import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { z } from "zod";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
  useWindowResource,
  usePointResource,
  usePointResources,
} from "@plugins/primitives/plugins/live-state/web";
import {
  pointResourceDescriptor,
  windowResourceDescriptor,
} from "@plugins/primitives/plugins/live-state/core";

const Row = z.object({ id: z.string(), n: z.number() });
type Row = z.infer<typeof Row>;
const keyOf = (r: unknown) => (r as Row).id;

const winResource = windowResourceDescriptor<Row>("test.hooks.window", Row, keyOf, {
  defaultLimit: 2,
});
const ptResource = pointResourceDescriptor<Row>("test.hooks.point", Row, keyOf);

function makeClient(): QueryClient {
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
  vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
  return rendered;
}

describe("useWindowResource", () => {
  it("a bare call lands on the descriptor's defaultParams tuple — a boot-hydrated value settles it with no load", async () => {
    const client = makeClient();
    const rows: Row[] = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
    // Boot-snapshot's hydration path: seed the DEFAULT-window tuple before mount.
    client.setQueryData(queryKeyFor(winResource.key, winResource.defaultParams), rows);

    const { result } = mount(client, () => useWindowResource(winResource));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual(rows);
    expect("error" in r).toBe(false);
  });

  it("an explicit limit subscribes on the canonical {limit} tuple", () => {
    const client = makeClient();
    mount(client, () => useWindowResource(winResource, { limit: 5 }));
    expect(client.getQueryState(queryKeyFor(winResource.key, { limit: "5" }))).toBeDefined();
  });
});

describe("usePointResource", () => {
  it("settles to the row when it exists, preserving the union shape exactly", async () => {
    const client = makeClient();
    const { result } = mount(client, () => usePointResource(ptResource, "a"));
    expect(result.current.pending).toBe(true);

    act(() => {
      client.setQueryData(queryKeyFor(ptResource.key, { ids: "a" }), [{ id: "a", n: 7 }]);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual({ id: "a", n: 7 });
    expect("error" in r).toBe(false);
  });

  it("settles to null (a determinate non-value) when the server answers with no row", async () => {
    const client = makeClient();
    const { result } = mount(client, () => usePointResource(ptResource, "missing"));

    act(() => {
      client.setQueryData(queryKeyFor(ptResource.key, { ids: "missing" }), []);
    });
    // gate:true makes this flip reliable even though the selected slice (null)
    // is identical across the initialData→first-real-data boundary.
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toBeNull();
  });
});

describe("usePointResources", () => {
  it("subscribes on the canonical sorted/deduped multi-id tuple", async () => {
    const client = makeClient();
    const rows: Row[] = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
    client.setQueryData(queryKeyFor(ptResource.key, { ids: "a,b" }), rows);

    const { result } = mount(client, () => usePointResources(ptResource, ["b", "a", "a"]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    const r = result.current;
    if (r.pending) throw new Error("unreachable");
    expect(r.data).toEqual(rows);
  });
});
