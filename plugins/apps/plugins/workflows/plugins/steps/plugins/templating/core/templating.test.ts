import { describe, it, expect } from "bun:test";
import { getByPath, interpolate } from "./index";

describe("getByPath", () => {
  it("reads a nested dot-path", () => {
    expect(getByPath({ a: { b: 42 } }, "a.b")).toBe(42);
  });

  it("returns undefined for a missing key", () => {
    expect(getByPath({ a: {} }, "a.b")).toBeUndefined();
  });

  it("returns undefined for a non-object input", () => {
    expect(getByPath("nope", "a")).toBeUndefined();
  });

  it("returns undefined for an empty path", () => {
    expect(getByPath({ a: 1 }, "")).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("replaces a single token", () => {
    expect(interpolate("Hello {{ name }}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("renders the whole input for the `.` token", () => {
    expect(interpolate("{{ . }}", "seed")).toBe("seed");
  });

  it("renders an empty string for a missing field", () => {
    expect(interpolate("x={{ missing }}", { name: "Ada" })).toBe("x=");
  });

  it("JSON-stringifies an object value", () => {
    expect(interpolate("{{ obj }}", { obj: { a: 1 } })).toBe('{"a":1}');
  });

  it("replaces multiple tokens", () => {
    expect(interpolate("{{ a }}-{{ b }}", { a: 1, b: 2 })).toBe("1-2");
  });
});
