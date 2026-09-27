/**
 * The chrome star, driven through its real hook with the live read and the
 * endpoints stubbed: it reads ONE url (`{ where: { url }, limit: 1 }`), reads
 * nothing on the start page, stays disabled while that read is pending (never
 * claiming "not bookmarked", never adding a duplicate), and toggles by the row
 * it found.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mounting live-state otherwise schedules real log flushes at module eval —
// the convention the live-state hazard suites established.
vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

const state = vi.hoisted(() => ({
  current: "",
  result: undefined as unknown,
  queries: [] as unknown[],
  calls: [] as { route: string; args: unknown }[],
}));

vi.mock("@plugins/network/plugins/live/web", () => ({
  useLive: (_collection: unknown, query: unknown) => {
    state.queries.push(query);
    return state.result;
  },
}));

vi.mock("@plugins/infra/plugins/endpoints/web", () => ({
  useEndpointMutation: (endpoint: { route: string }) => ({
    mutateAsync: (args: unknown) => {
      state.calls.push({ route: endpoint.route, args });
      return Promise.resolve();
    },
  }),
}));

vi.mock("@plugins/apps/plugins/browser/plugins/shell/web", () => ({
  useBrowserNav: () => ({ current: state.current }),
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BookmarkRow } from "../../core";
import { BookmarkStar } from "../components/bookmark-star";

const URL_A = "https://example.com/a";
const refetch = () => Promise.resolve();
const paging = { canGrow: false, growing: false, loadMore: () => {} };

function settled(rows: BookmarkRow[]) {
  state.result = { pending: false, data: rows, refetch, ...paging };
}

beforeEach(() => {
  state.current = "";
  state.result = { pending: true, error: null, refetch };
  state.queries = [];
  state.calls = [];
});

afterEach(() => {
  cleanup();
});

describe("BookmarkStar", () => {
  it("reads nothing and is disabled on the start page", () => {
    render(<BookmarkStar />);
    const star = screen.getByRole("button", { name: "Add bookmark" });
    expect(star).toHaveProperty("disabled", true);
    expect(state.queries).toEqual([]);
  });

  it("reads the current url alone, and is disabled while that read is pending", () => {
    state.current = URL_A;
    render(<BookmarkStar />);
    expect(state.queries.at(-1)).toEqual({ where: { url: URL_A }, limit: 1 });
    const star = screen.getByRole("button", { name: "Add bookmark" });
    expect(star).toHaveProperty("disabled", true);
    fireEvent.click(star);
    expect(state.calls).toEqual([]);
  });

  it("adds a bookmark titled by the host when the url has none", () => {
    state.current = URL_A;
    settled([]);
    render(<BookmarkStar />);
    const star = screen.getByRole("button", { name: "Add bookmark" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(star);
    expect(state.calls).toEqual([
      {
        route: "POST /api/browser/bookmarks",
        args: { body: { url: URL_A, title: "example.com" } },
      },
    ]);
  });

  it("removes the bookmark it found", () => {
    state.current = URL_A;
    settled([{ id: "b1", url: URL_A, title: "A", createdAt: new Date(0) }]);
    render(<BookmarkStar />);
    const star = screen.getByRole("button", { name: "Remove bookmark" });
    expect(star.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(star);
    expect(state.calls).toEqual([
      {
        route: "DELETE /api/browser/bookmarks/:id",
        args: { params: { id: "b1" } },
      },
    ]);
  });
});
