import { describe, expect, test } from "bun:test";
import { mocksProblemDetail, parseMocks } from "./mocks";

// The syntax pin. Every reader of a prototype's `mocks` declaration — the
// HTML parser, the folder validator, the Compare stage's dispatch — goes through
// `parseMocks`, so the split rule lives here and nowhere else.

describe("parseMocks", () => {
  test("absent or blank is none, not a problem", () => {
    expect(parseMocks("")).toEqual({ kind: "none" });
    expect(parseMocks("   \n\t")).toEqual({ kind: "none" });
  });

  test("a fixture declaration", () => {
    expect(parseMocks("fixture:control-panel/setting-rail")).toEqual({
      kind: "declared",
      tag: "fixture",
      ref: "control-panel/setting-rail",
    });
  });

  test("a route declaration", () => {
    expect(parseMocks("route:/agents")).toEqual({
      kind: "declared",
      tag: "route",
      ref: "/agents",
    });
  });

  test("a route with a query is one ref", () => {
    expect(parseMocks("route:/agents?tab=x")).toEqual({
      kind: "declared",
      tag: "route",
      ref: "/agents?tab=x",
    });
  });

  test("only the FIRST colon splits — the ref keeps its own", () => {
    expect(parseMocks("a:b:c")).toEqual({
      kind: "declared",
      tag: "a",
      ref: "b:c",
    });
  });

  test("whitespace around either half is ignored", () => {
    expect(parseMocks("  fixture : control-panel/setting-rail  ")).toEqual({
      kind: "declared",
      tag: "fixture",
      ref: "control-panel/setting-rail",
    });
  });

  test("the bare legacy form (a fixture id with no kind) is malformed", () => {
    const d = parseMocks("control-panel/setting-rail");
    expect(d.kind).toBe("malformed");
    if (d.kind !== "malformed") return;
    expect(d.raw).toBe("control-panel/setting-rail");
    expect(d.reason).toContain("<kind>:");
  });

  test("an empty kind is malformed", () => {
    const d = parseMocks(":x");
    expect(d.kind).toBe("malformed");
    if (d.kind !== "malformed") return;
    expect(d.reason).toBe("the kind before the colon is empty");
  });

  test("an empty ref is malformed", () => {
    const d = parseMocks("x:");
    expect(d.kind).toBe("malformed");
    if (d.kind !== "malformed") return;
    expect(d.reason).toBe("there is nothing after the colon");
  });

  test("a kind is lowercase letters, digits and dashes", () => {
    expect(parseMocks("Fixture:x").kind).toBe("malformed");
    expect(parseMocks("my kind:x").kind).toBe("malformed");
    expect(parseMocks("1st:x").kind).toBe("malformed");
    expect(parseMocks("my-kind2:x")).toEqual({
      kind: "declared",
      tag: "my-kind2",
      ref: "x",
    });
  });
});

describe("mocksProblemDetail", () => {
  test("quotes the raw value and the reason, and points at the Compare stage", () => {
    const d = parseMocks("control-panel/setting-rail");
    if (d.kind !== "malformed") throw new Error("expected malformed");
    const detail = mocksProblemDetail(d);
    expect(detail).toContain('content="control-panel/setting-rail"');
    expect(detail).toContain(d.reason);
    expect(detail).toContain("Compare stage");
  });
});
