import { describe, expect, test } from "bun:test";
import type { Route } from "@plugins/framework/plugins/resource-runtime/core";
import { compiledRoutePlan } from "./routes";

// A reverse probe answers the host pk's raw values and cuts by `within` as raw
// values: beside an identity route that encodes its ids (a union arm), both
// would be in the wrong key space, so the compile refuses the pair.

const usesOf = () => new Map();
const reverse: Route = {
  id: "source",
  table: "sources",
  map: { kind: "reverse", column: "id", resolve: async () => [] },
  columns: ["id"],
};

describe("compiledRoutePlan", () => {
  test("a reverse route beside an encoded identity route throws", () => {
    const encoded: Route = {
      id: "base",
      table: "events",
      map: { kind: "identity", encode: (v) => `event:${v}` },
      columns: ["id"],
    };
    expect(() => compiledRoutePlan([encoded, reverse], usesOf)).toThrow(
      /a reverse route \("source"\) beside an encoded identity route \("base"\)/,
    );
  });

  test("a reverse route beside a plain identity route mints", () => {
    const plain: Route = {
      id: "base",
      table: "events",
      map: { kind: "identity" },
      columns: ["id"],
    };
    expect(compiledRoutePlan([plain, reverse], usesOf).routes).toHaveLength(2);
  });
});
