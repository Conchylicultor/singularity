/**
 * Tests for the pure readiness combinators. `useCombinedResources` /
 * `<ResourceView>` are thin shells over these; testing the pure functions
 * locks the load-bearing invariants: the three states and their precedence
 * (error > loading > ready), per-key data mapping, first-error propagation,
 * `foldResource`'s explicit per-state answers, `mapResource`'s pass-through of
 * the loading and error arms, and acceptance of any `status`-named input
 * (`useOptimisticResource`'s result — the named exemption — included).
 */

import { test, expect, describe } from "bun:test";
import { ResourceError } from "../core";
import {
  combineResources,
  foldResource,
  mapResource,
  statusOf,
} from "./resource-utils";
import type { ResourceResult } from "./use-resource";

const refetch = () => Promise.resolve();
const ready = <T>(data: T): ResourceResult<T> => ({
  status: "ready",
  data,
  refetch,
});
const loading = <T>(): ResourceResult<T> => ({
  status: "loading",
  refetch,
});
const failed = <T>(error: ResourceError, stale?: T): ResourceResult<T> =>
  stale === undefined
    ? { status: "error", error, refetch }
    : { status: "error", error, stale, refetch };

const boom = new ResourceError("loader-failed", "boom", null);

describe("combineResources", () => {
  test("loading until every input is ready", () => {
    expect(combineResources({ a: ready([1]), b: loading() }).status).toBe(
      "loading",
    );
    expect(combineResources({ a: loading(), b: loading() }).status).toBe(
      "loading",
    );
  });

  test("ready with per-key data once all inputs are ready", () => {
    const r = combineResources({ a: ready([1, 2]), b: ready("x") });
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.data.a).toEqual([1, 2]);
    expect(r.data.b).toBe("x");
    expect(r.status).toBe("ready");
  });

  test("precedence: error > loading > ready — one failure fails the combine even while others load", () => {
    const r = combineResources({ a: failed(boom), b: loading(), c: ready(1) });
    expect(r.status).toBe("error");
    if (r.status !== "error") throw new Error("unreachable");
    expect(r.error).toBe(boom);
  });

  test("carries the FIRST failed input's error", () => {
    const second = new ResourceError("transport", "later", null);
    const r = combineResources({ a: failed(boom), b: failed(second) });
    if (r.status !== "error") throw new Error("unreachable");
    expect(r.error).toBe(boom);
  });

  test("accepts an optimistic-shaped ready input (status + data + extras)", () => {
    const optimistic = {
      status: "ready" as const,
      data: { ranks: [] },
      dispatch: () => "op",
    };
    const r = combineResources({ q: optimistic, other: ready(0) });
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.data.q).toEqual({ ranks: [] });
  });

  test("an error input carrying a plain Error has it wrapped as loader-failed", () => {
    const plain = new Error("legacy");
    const r = combineResources({ a: { status: "error", error: plain } });
    if (r.status !== "error") throw new Error("unreachable");
    expect(r.error).toBeInstanceOf(ResourceError);
    expect(r.error.kind).toBe("loader-failed");
    expect(r.error.message).toBe("legacy");
    expect(r.error.cause).toBe(plain);
  });

  test("refetch refetches every input that can", async () => {
    let calls = 0;
    const counting = (): ResourceResult<number> => ({
      status: "loading",
      refetch: () => {
        calls++;
        return Promise.resolve();
      },
    });
    await combineResources({ a: counting(), b: counting() }).refetch();
    expect(calls).toBe(2);
  });

  test("empty input set is ready", () => {
    expect(combineResources({}).status).toBe("ready");
  });
});

describe("statusOf", () => {
  test("reads `status`", () => {
    expect(statusOf(ready(1))).toBe("ready");
    expect(statusOf(loading())).toBe("loading");
    expect(statusOf(failed(boom))).toBe("error");
  });
});

describe("foldResource", () => {
  const handlers = {
    loading: () => "loading",
    error: (e: ResourceError, stale: number[] | undefined) =>
      `error:${e.kind}:${stale === undefined ? "none" : stale.length}`,
    ready: (rows: number[]) => `ready:${rows.length}`,
  };

  test("names what every state yields", () => {
    expect(foldResource(loading<number[]>(), handlers)).toBe("loading");
    expect(foldResource(ready([1, 2]), handlers)).toBe("ready:2");
    expect(foldResource(failed<number[]>(boom), handlers)).toBe(
      "error:loader-failed:none",
    );
    expect(foldResource(failed(boom, [1, 2, 3]), handlers)).toBe(
      "error:loader-failed:3",
    );
  });
});

describe("mapResource", () => {
  test("maps the ready arm and a stale value; passes loading and error through", () => {
    const len = (xs: number[]) => xs.length;
    const r = mapResource(ready([1, 2]), len);
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.data).toBe(2);

    expect(mapResource(loading<number[]>(), len).status).toBe("loading");

    const e = mapResource(failed(boom, [1, 2, 3]), len);
    if (e.status !== "error") throw new Error("unreachable");
    expect(e.error).toBe(boom);
    expect(e.stale).toBe(3);

    const noStale = mapResource(failed<number[]>(boom), len);
    if (noStale.status !== "error") throw new Error("unreachable");
    expect("stale" in noStale).toBe(false);
  });
});
