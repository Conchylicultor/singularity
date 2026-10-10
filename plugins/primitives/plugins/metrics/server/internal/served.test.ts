import { describe, expect, spyOn, test } from "bun:test";
import { createHarness } from "@plugins/framework/plugins/resource-runtime/core/testing";
import {
  compilePagedValue,
  compileQueryValue,
} from "@plugins/network/plugins/live/server";
import { defineMetric, defineMetricSource } from "../../core/define-metric";
import { metricDetails, metricQuery } from "../../core";
import { serveMetric, type SourceImpl } from "./contribution";
import { buildMetricRegistry } from "./registry";
import { detailsOptions, queryOptions } from "./served";
import { createSourceWatch } from "./source-watch";

// The served loaders and the source watch, driven through the options
// `network/live` compiles them into — the same path `serveValue` takes.

const src = defineMetricSource({ id: "fake", label: "Fake" });
const done = defineMetric(src, {
  id: "done",
  label: "Done",
  unit: "count",
  polarity: "up",
  measure: "flow",
  drill: { label: "Tasks" },
});
const open = defineMetric(src, {
  id: "open",
  label: "Open",
  unit: "count",
  polarity: "down",
  measure: "level",
});

/** A source whose `changes` the test fires, counting starts and stops. */
function fakeSource() {
  const life = {
    starts: 0,
    stops: 0,
    bump: undefined as (() => void) | undefined,
  };
  const source: SourceImpl = {
    source: src,
    metrics: [
      serveMetric(done, {
        evaluate: async ({ intervals, split }) =>
          split === null
            ? [{ key: "total", label: "Total", values: intervals.map(() => 1) }]
            : [],
        details: async ({ cursor, limit }) => ({
          items: [
            {
              id: cursor ?? "first",
              title: `${limit}`,
              at: "2026-10-01T00:00:00Z",
            },
          ],
          total: 2,
          nextCursor: cursor === null ? "next" : null,
        }),
      }),
      serveMetric(open, {
        evaluate: async ({ intervals }) => [
          { key: "total", label: "Total", values: intervals.map(() => 0) },
        ],
      }),
    ],
    changes: (bump) => {
      life.starts++;
      life.bump = bump;
      return () => {
        life.stops++;
        life.bump = undefined;
      };
    },
  };
  return { source, life };
}

const query = (metric: string) => ({
  metric,
  range: { preset: "7d" as const },
  tz: "UTC",
  params: {},
  compare: false,
});

describe("served metrics values", () => {
  test("the query loader evaluates the decoded question", async () => {
    const { source } = fakeSource();
    const registry = buildMetricRegistry([source]);
    const watch = createSourceWatch((id) => registry.source(id));
    const compiled = compileQueryValue(
      metricQuery,
      queryOptions(() => registry, watch),
    );
    const result = await compiled.options.loader(
      metricQuery.query.encode(query("fake.done")),
    );
    expect(result.kind).toBe("series");
  });

  test("the details loader pages by the provider's cursor and carries the total as meta", async () => {
    const { source } = fakeSource();
    const registry = buildMetricRegistry([source]);
    const watch = createSourceWatch((id) => registry.source(id));
    const compiled = compilePagedValue(
      metricDetails,
      detailsOptions(() => registry, watch),
    );
    const selector = {
      metric: "fake.done",
      interval: { start: "2026-09-29T00:00:00Z", end: "2026-09-30T00:00:00Z" },
      split: null,
      params: {},
    };
    const first = await compiled.options.loader(
      metricDetails.query.encode(selector, { cursor: null, limit: 5 }),
    );
    expect(first).toEqual({
      items: [{ id: "first", title: "5", at: "2026-10-01T00:00:00Z" }],
      nextCursor: "next",
      meta: { total: 2 },
    });
  });

  test("two subscribed queries on one source share one `changes` subscription; a change notifies both; the last release stops it", () => {
    const { source, life } = fakeSource();
    const registry = buildMetricRegistry([source]);
    const watch = createSourceWatch((id) => registry.source(id));
    const compiled = compileQueryValue(
      metricQuery,
      queryOptions(() => registry, watch),
    );
    const notified: unknown[] = [];
    compiled.bindNotify((params) => notified.push(params));
    const a = metricQuery.query.encode(query("fake.done"));
    const b = metricQuery.query.encode(query("fake.open"));
    const { onFirstSubscribe, onLastUnsubscribe } = compiled.options;
    void onFirstSubscribe!(a);
    void onFirstSubscribe!(b);
    expect(life.starts).toBe(1);
    life.bump!();
    expect(notified).toEqual([a, b]);
    onLastUnsubscribe!(a);
    expect(life.stops).toBe(0);
    onLastUnsubscribe!(b);
    expect(life.stops).toBe(1);
    // Watched again from scratch on the next subscriber.
    void onFirstSubscribe!(a);
    expect(life.starts).toBe(2);
  });

  test("an unknown metric watches nothing (its loader is what fails)", () => {
    const { source, life } = fakeSource();
    const registry = buildMetricRegistry([source]);
    const watch = createSourceWatch((id) => registry.source(id));
    const compiled = compileQueryValue(
      metricQuery,
      queryOptions(() => registry, watch),
    );
    compiled.bindNotify(() => {});
    void compiled.options.onFirstSubscribe!(
      metricQuery.query.encode(query("fake.nope")),
    );
    expect(life.starts).toBe(0);
  });
});

describe("a refused question", () => {
  test("an unknown metric reaches the reader as `refused`, with the message, and is not reported", async () => {
    const { source } = fakeSource();
    const registry = buildMetricRegistry([source]);
    const watch = createSourceWatch((id) => registry.source(id));
    const compiled = compileQueryValue(
      metricQuery,
      queryOptions(() => registry, watch),
    );
    const reported: unknown[] = [];
    const h = createHarness({ reportError: (_c, err) => reported.push(err) });
    h.runtime.defineExternalResource(metricQuery, compiled.options);
    const info = spyOn(console, "info").mockImplementation(() => {});
    const { q } = metricQuery.query.encode(query("fake.nope"));
    const res = await h.runtime.handleResourceHttp(
      new Request(
        `http://x/api/resources/metrics.query?q=${encodeURIComponent(q)}`,
      ),
      { key: "metrics.query" },
    );
    info.mockRestore();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      reason: "refused",
      detail: 'unknown metric "fake.nope"',
    });
    expect(reported).toEqual([]);
  });
});

describe("source watch", () => {
  test("a source with no `changes` watches nothing", () => {
    const watch = createSourceWatch(() => ({ source: src, metrics: [] }));
    const release = watch.acquire("fake", () => {
      throw new Error("never notified");
    });
    release();
  });

  test("a release is idempotent, and the same notify acquired twice is two holds", () => {
    const { source, life } = fakeSource();
    const watch = createSourceWatch(() => source);
    let n = 0;
    const notify = () => n++;
    const r1 = watch.acquire("fake", notify);
    const r2 = watch.acquire("fake", notify);
    life.bump!();
    expect(n).toBe(2);
    r1();
    r1();
    expect(life.stops).toBe(0);
    r2();
    expect(life.stops).toBe(1);
  });
});
