import { describe, expect, test } from "bun:test";
import { CollectBodySchema, stripQuery } from "./collect-body";

describe("stripQuery", () => {
  test("removes query and fragment", () => {
    expect(stripQuery("/a/b?x=1#top")).toBe("/a/b");
    expect(stripQuery("/a#x?y")).toBe("/a");
    expect(stripQuery("/plain")).toBe("/plain");
  });
});

describe("CollectBodySchema", () => {
  test("a pageview path loses its query string server-side too", () => {
    const body = CollectBodySchema.parse({
      kind: "pageview",
      host: "Equin.dev",
      path: "/harness?token=secret",
    });
    expect(body).toEqual({
      kind: "pageview",
      host: "equin.dev",
      path: "/harness",
    });
  });
  test("event names are lowercase snake", () => {
    const base = { kind: "event", host: "a.example", path: "/" };
    expect(
      CollectBodySchema.safeParse({ ...base, name: "improve_open" }).success,
    ).toBe(true);
    expect(
      CollectBodySchema.safeParse({ ...base, name: "Improve-Open" }).success,
    ).toBe(false);
  });
  test("at most ten props", () => {
    const props = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]),
    );
    expect(
      CollectBodySchema.safeParse({
        kind: "event",
        host: "a.example",
        path: "/",
        name: "x",
        props,
      }).success,
    ).toBe(false);
  });
  test("unknown fields are refused", () => {
    expect(
      CollectBodySchema.safeParse({
        kind: "pageview",
        host: "a.example",
        path: "/",
        ip: "1.2.3.4",
      }).success,
    ).toBe(false);
  });
});
