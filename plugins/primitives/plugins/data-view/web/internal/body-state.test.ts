/**
 * `resolveBodyState` — what a DataView body renders in place of its view. The
 * load-bearing case is the failed read: `readiness.status === "error"` renders
 * the error state, never the view (whose zero rows would render `emptyState`,
 * a claim that there is nothing here).
 */

import { describe, expect, test } from "bun:test";
import { ResourceError } from "@plugins/primitives/plugins/live-state/core";
import { resolveBodyState } from "./body-state";

const refetch = () => Promise.resolve();
const failure = new ResourceError("loader-failed", "boom", null);

describe("resolveBodyState", () => {
  test("a failed read renders the error state, not the view", () => {
    const state = resolveBodyState({
      server: null,
      readiness: { status: "error", error: failure, refetch },
    });
    expect(state.kind).toBe("error");
    if (state.kind !== "error") throw new Error("unreachable");
    expect(state.error.error).toBe(failure);
    expect(state.error.refetch).toBe(refetch);
  });

  test("readiness loading → loading; ready → the view", () => {
    expect(
      resolveBodyState({
        server: null,
        readiness: { status: "loading" },
      }).kind,
    ).toBe("loading");
    expect(
      resolveBodyState({
        server: null,
        readiness: { status: "ready" },
      }).kind,
    ).toBe("view");
  });

  test("without readiness, the rows are the view", () => {
    expect(resolveBodyState({ server: null, readiness: undefined }).kind).toBe(
      "view",
    );
  });

  test("a live origin keeps its own error and loading", () => {
    const err = new Error("sql");
    expect(
      resolveBodyState({
        server: { loading: false, error: err, readError: null },
        readiness: { status: "loading" },
      }),
    ).toEqual({ kind: "server-error", error: err });
    expect(
      resolveBodyState({
        server: { loading: true, error: null, readError: null },
        readiness: undefined,
      }).kind,
    ).toBe("loading");
  });

  test("a server-ordered read that failed renders the read error, not a server error", () => {
    const readError = { status: "error" as const, error: failure, refetch };
    expect(
      resolveBodyState({
        server: { loading: false, error: null, readError },
        readiness: undefined,
      }),
    ).toEqual({ kind: "error", error: readError });
    // The query it could not form outranks it — nothing was read.
    const err = new Error("filter");
    expect(
      resolveBodyState({
        server: { loading: false, error: err, readError },
        readiness: undefined,
      }).kind,
    ).toBe("server-error");
  });
});
