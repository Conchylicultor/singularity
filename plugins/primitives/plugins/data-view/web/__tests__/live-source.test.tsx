/**
 * The DataView → live-window adapter (`useLiveSource`) over a real
 * NotificationsProvider + QueryClient: which window tuple a view state lowers
 * to (the tuple the scroll subscribes, read back from the query cache), and
 * how the scroll maps onto what the body renders.
 *
 * - the lowering: field id → column rename, the source's scope ANDed first,
 *   the search debounced, a duplicate order column dropped;
 * - a one-bucket-per-value grouping prepends its column and orders sections by
 *   appearance; a bucketed one neither prepends nor reorders;
 * - a saved rule on a field that does not resolve is pending while the
 *   deferred tier loads, and the error arm once it settled;
 * - the skeleton until the head settles, then an empty set is empty;
 * - the footer: `hasNextPage` from `canGrow` and the paging hold;
 * - a failed head read is the body's read-error arm: the failure with Retry,
 *   whose click re-reads the head (never a bare "Couldn't load" line).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { z } from "zod";
import { markDeferredLoadComplete } from "@plugins/framework/plugins/web-sdk/core";
import { resetDeferredLoadStateForTests } from "@plugins/framework/plugins/web-sdk/core/testing";
import {
  NotificationsProvider,
  ResourceError,
  getNotificationsClient,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import {
  liveCollection,
  type LiveQuery,
} from "@plugins/network/plugins/live/core";
import {
  and,
  clause,
  liveBoolean,
  liveInstant,
  liveStringArray,
  liveText,
  or,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  type FieldDef,
  type FieldGrouping,
  type FilterOperatorSet,
  type LiveDataSource,
  type ViewState,
} from "../../core";
import { liveDataSource } from "../internal/live-data-source";
import { resolveLiveFields } from "../internal/live-fields";
import { useLiveSource } from "../internal/live-source";
import { UnavailableSortRuleError } from "../internal/server-filter";
import { resolveBodyState } from "../internal/body-state";
import { BodyFallback } from "../components/body-fallback";

const Thread = z.object({
  id: z.string(),
  subject: z.string(),
  labelIds: z.array(z.string()),
  unread: z.boolean(),
  lastMessageAt: z.date(),
});
type Thread = z.infer<typeof Thread>;

let n = 0;
const threads = () =>
  liveCollection(`test.data-view.live-adapter-${n++}`, {
    row: Thread,
    id: "id",
    filterable: {
      subject: liveText(),
      labelIds: liveStringArray(),
      unread: liveBoolean(),
      lastMessageAt: liveInstant(),
    },
    sortable: ["subject", "lastMessageAt"],
    default: { orderBy: [["lastMessageAt", "desc"]], limit: 2 },
    maxLimit: 6,
    scroll: true,
  });
type C = ReturnType<typeof threads>;

/** Operator sets reduced to what the lowering reads: a domain and one operator. */
const SETS: Record<string, FilterOperatorSet> = {
  text: {
    match: "text",
    domain: "text",
    operators: [
      {
        id: "is",
        label: "is",
        hasValue: true,
        lower: (operand, ctx) =>
          typeof operand === "string" && operand !== ""
            ? clause(ctx.column, "eq", operand)
            : undefined,
      },
    ],
  },
  tags: {
    match: "tags",
    domain: "stringArray",
    operators: [
      {
        id: "has-any",
        label: "has any",
        hasValue: true,
        lower: (operand, ctx) =>
          Array.isArray(operand) && operand.length > 0
            ? clause(ctx.column, "hasAny", operand as string[])
            : undefined,
      },
    ],
  },
  bool: { match: "bool", domain: "boolean", operators: [] },
  date: { match: "date", domain: "instant", operators: [] },
};
const resolveOperatorSet = (type: string) => SETS[type];

const PER_VALUE: FieldGrouping = {
  id: "value",
  label: "Value",
  oneBucketPerValue: true,
  plan: () => (v) => ({ key: String(v), label: String(v), order: 0 }),
};
const BY_DAY: FieldGrouping = {
  id: "day",
  label: "Day",
  plan: () => (v) => ({ key: String(v), label: String(v), order: 0 }),
};
const resolveGrouping = (_type: string, groupingId: string) =>
  groupingId === "day" ? BY_DAY : PER_VALUE;

function fieldsOf(c: C): FieldDef<Thread>[] {
  return [
    { id: "subject", label: "Subject", type: "text", value: (t) => t.subject },
    {
      id: "labels",
      label: "Labels",
      type: "tags",
      values: (t) => t.labelIds,
      column: c.column("labelIds"),
    },
    { id: "unread", label: "Unread", type: "bool", value: (t) => t.unread },
    {
      id: "lastMessageAt",
      label: "Last message",
      type: "date",
      value: (t) => t.lastMessageAt,
    },
  ];
}

const baseState: ViewState = { sort: [], filter: null, query: "" };

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
}

function mount(
  client: QueryClient,
  c: C,
  initial: {
    state: ViewState;
    scoped?: boolean;
    awaiting?: boolean;
    hold?: boolean;
  },
) {
  const all = liveDataSource(c, { searchable: ["subject"] });
  const source = initial.awaiting
    ? all.awaitingScope(["unread"])
    : initial.scoped
      ? all.scoped({ where: { unread: true } })
      : all;
  const fields = fieldsOf(c);
  const plan = resolveLiveFields(fields, source, resolveOperatorSet, "host");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>
      {children}
    </NotificationsProvider>
  );
  const rendered = renderHook(
    (p: { state: ViewState; hold?: boolean }) =>
      useLiveSource<Thread>({
        source,
        plan,
        fields,
        state: p.state,
        resolveOperatorSet,
        resolveGrouping,
        holdPaging: () => p.hold === true,
      }),
    { wrapper, initialProps: { state: initial.state, hold: initial.hold } },
  );
  const notifications = getNotificationsClient();
  if (!notifications) throw new Error("NotificationsClient not created");
  vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
  return rendered;
}

/** The window tuples of `c` the cache holds (one per subscribed segment). */
function tuples(client: QueryClient, c: C): unknown[] {
  return client
    .getQueryCache()
    .findAll()
    .filter((q) => (q.queryKey as unknown[])[0] === c.key)
    .map((q) => (q.queryKey as unknown[])[1] ?? {});
}
const expectTuple = (
  client: QueryClient,
  c: C,
  query: LiveQuery<C["filterable"], "subject" | "lastMessageAt">,
) => expect(tuples(client, c)).toContainEqual(c.window.window.encode(query));

const wire = (ids: number[]) =>
  ids.map((i) => ({
    id: `t${i}`,
    subject: `s${i}`,
    labelIds: [],
    unread: true,
    lastMessageAt: new Date(i * 1000),
    $key: JSON.stringify([String(i), `t${i}`]),
  }));

beforeEach(() => resetDeferredLoadStateForTests());
afterEach(() => {
  cleanup();
  resetDeferredLoadStateForTests();
});

describe("useLiveSource — lowering", () => {
  it("renames a field onto its column, ANDs the scope first, and sorts by columns", () => {
    const c = threads();
    const client = makeClient();
    mount(client, c, {
      scoped: true,
      state: {
        ...baseState,
        sort: [{ fieldId: "subject", direction: "asc" }],
        filter: {
          kind: "group",
          id: "g",
          conjunction: "and",
          children: [
            {
              kind: "rule",
              id: "r",
              fieldId: "labels",
              operatorId: "has-any",
              value: ["INBOX"],
            },
          ],
        },
      },
    });
    expectTuple(client, c, {
      where: and(
        clause("unread", "eq", true),
        clause("labelIds", "hasAny", ["INBOX"]),
      ),
      orderBy: [["subject", "asc"]],
      limit: 2,
    });
  });

  it("debounces the search, and a search-only change keeps the previous rows until the new head settles", async () => {
    const c = threads();
    const client = makeClient();
    const { result, rerender } = mount(client, c, { state: baseState });
    act(() => {
      client.setQueryData(queryKeyFor(c.key, { limit: "2" }), wire([1]));
    });
    await waitFor(() => expect(result.current!.loading).toBe(false));

    rerender({ state: { ...baseState, query: "hello" }, hold: false });
    // Not yet: the keystroke has not settled.
    expect(tuples(client, c)).toHaveLength(1);
    const searched = c.window.window.encode({
      where: or(clause("subject", "contains", "hello")),
      limit: 2,
    });
    await waitFor(() => expect(tuples(client, c)).toContainEqual(searched), {
      timeout: 1000,
    });
    // The previous rows stay on screen, never the skeleton.
    expect(result.current!.loading).toBe(false);
    expect(result.current!.rows.map((r) => r.id)).toEqual(["t1"]);
    act(() => {
      client.setQueryData(queryKeyFor(c.key, searched), []);
    });
    await waitFor(() => expect(result.current!.rows).toEqual([]));
    expect(result.current!.loading).toBe(false);
  });

  it("a one-bucket-per-value grouping leads the order (the default after it), sections by appearance", () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, {
      state: {
        ...baseState,
        groupBy: { fieldId: "subject", groupingId: "value" },
      },
    });
    expectTuple(client, c, {
      orderBy: [
        ["subject", "asc"],
        ["lastMessageAt", "desc"],
      ],
      limit: 2,
    });
    expect(result.current!.sectionOrder).toBe("appearance");
  });

  it("a grouped column the sort already names is not named twice", () => {
    const c = threads();
    const client = makeClient();
    mount(client, c, {
      state: {
        ...baseState,
        sort: [
          { fieldId: "lastMessageAt", direction: "asc" },
          { fieldId: "subject", direction: "desc" },
        ],
        groupBy: { fieldId: "subject", groupingId: "value" },
      },
    });
    expectTuple(client, c, {
      orderBy: [
        ["subject", "desc"],
        ["lastMessageAt", "asc"],
      ],
      limit: 2,
    });
  });

  it("a bucketed grouping neither prepends nor reorders the user's sort", () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, {
      state: {
        ...baseState,
        sort: [{ fieldId: "subject", direction: "asc" }],
        groupBy: { fieldId: "lastMessageAt", groupingId: "day" },
      },
    });
    expectTuple(client, c, { orderBy: [["subject", "asc"]], limit: 2 });
    expect(result.current!.sectionOrder).toBe("bucket");
  });
});

describe("useLiveSource — states", () => {
  it("a scope not known yet reads nothing and is the loading state", () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, { awaiting: true, state: baseState });
    expect(result.current?.loading).toBe(true);
    expect(result.current?.rows).toEqual([]);
    expect(tuples(client, c)).toEqual([]);
  });

  it("a saved sort on a field that does not resolve is pending before the deferred tier settles, the error arm after", async () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, {
      state: {
        ...baseState,
        sort: [{ fieldId: "playCount", direction: "desc" }],
      },
    });
    expect(result.current!.loading).toBe(true);
    expect(result.current!.error).toBeNull();
    expect(tuples(client, c)).toHaveLength(0);
    act(() => markDeferredLoadComplete());
    await waitFor(() =>
      expect(result.current!.error).toBeInstanceOf(UnavailableSortRuleError),
    );
    expect(result.current!.loading).toBe(false);
  });

  it("the skeleton until the head settles; an empty head is the empty state", async () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, { state: baseState });
    expect(result.current!.loading).toBe(true);
    act(() => {
      client.setQueryData(queryKeyFor(c.key, { limit: "2" }), []);
    });
    await waitFor(() => expect(result.current!.loading).toBe(false));
    expect(result.current!.rows).toEqual([]);
    expect(result.current!.rowsComplete).toBe(true);
  });

  it("the footer pages while the scroll can grow — and not while the paging is held", async () => {
    const c = threads();
    const client = makeClient();
    const { result, rerender } = mount(client, c, { state: baseState });
    act(() => {
      client.setQueryData(queryKeyFor(c.key, { limit: "2" }), wire([1, 2]));
    });
    await waitFor(() => expect(result.current!.scroll.hasNextPage).toBe(true));
    expect(result.current!.rowsComplete).toBe(false);
    expect(result.current!.rows.map((r) => r.id)).toEqual(["t1", "t2"]);
    // `$key` never reaches the view.
    expect(Object.keys(result.current!.rows[0]!)).not.toContain("$key");
    rerender({ state: baseState, hold: true });
    expect(result.current!.scroll.hasNextPage).toBe(false);
  });
});

/**
 * The body's path for a live source, minus the views: the adapter's answer,
 * `resolveBodyState`, and what renders in place of the view.
 */
function LiveBody(props: {
  source: LiveDataSource<Thread>;
  fields: FieldDef<Thread>[];
}) {
  const plan = resolveLiveFields(
    props.fields,
    props.source,
    resolveOperatorSet,
    "host",
  );
  const origin = useLiveSource<Thread>({
    source: props.source,
    plan,
    fields: props.fields,
    state: baseState,
    resolveOperatorSet,
    resolveGrouping,
    holdPaging: () => false,
  });
  const state = resolveBodyState({ server: origin, readiness: undefined });
  return state.kind === "view" ? (
    <ul>
      {origin!.rows.map((r) => (
        <li key={r.id}>{r.subject}</li>
      ))}
    </ul>
  ) : (
    <BodyFallback
      state={state}
      errorState={undefined}
      loadingState={<p>loading</p>}
      loadingVariant={undefined}
      loadingCount={undefined}
    />
  );
}

describe("useLiveSource — a failed head read", () => {
  it("renders the read's failure with Retry, and Retry re-reads the head", async () => {
    const c = threads();
    const client = makeClient();
    const source = liveDataSource(c, { searchable: ["subject"] });
    render(
      <NotificationsProvider queryClient={client}>
        <LiveBody source={source} fields={fieldsOf(c)} />
      </NotificationsProvider>,
    );
    const notifications = getNotificationsClient();
    if (!notifications) throw new Error("NotificationsClient not created");
    vi.spyOn(notifications, "hasEverBeenReady").mockReturnValue(true);
    expect(screen.getByText("loading")).toBeTruthy();

    const head = queryKeyFor(c.key, { limit: "2" });
    const fetch = vi
      .spyOn(notifications, "fetchOverHttp")
      .mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await expect(
        client.getQueryCache().find({ queryKey: head, exact: true })!.fetch(),
      ).rejects.toThrow("boom");
    });
    // The read's own failure, typed — not a bare server-error line.
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy());
    const retry = screen.getByRole("button", { name: "Retry" });

    fetch.mockResolvedValueOnce(wire([1, 2]));
    await act(async () => {
      fireEvent.click(retry);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText("s1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("the adapter hands the head failure over as a read error, not a query error", async () => {
    const c = threads();
    const client = makeClient();
    const { result } = mount(client, c, { state: baseState });
    const notifications = getNotificationsClient()!;
    vi.spyOn(notifications, "fetchOverHttp").mockRejectedValueOnce(
      new Error("boom"),
    );
    await act(async () => {
      await expect(
        client
          .getQueryCache()
          .find({ queryKey: queryKeyFor(c.key, { limit: "2" }), exact: true })!
          .fetch(),
      ).rejects.toThrow("boom");
    });
    await waitFor(() => expect(result.current!.readError).not.toBeNull());
    expect(result.current!.error).toBeNull();
    expect(result.current!.loading).toBe(false);
    expect(result.current!.readError!.error).toBeInstanceOf(ResourceError);
  });
});
