import { describe, expect, it } from "bun:test";
import { decodeCursor, encodeCursor, sortSignature } from "./cursor";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";

describe("sortSignature", () => {
  it("is order-sensitive and direction-sensitive", () => {
    const a: SortRule[] = [
      { fieldId: "createdAt", direction: "desc" },
      { fieldId: "title", direction: "asc" },
    ];
    const b: SortRule[] = [
      { fieldId: "title", direction: "asc" },
      { fieldId: "createdAt", direction: "desc" },
    ];
    expect(sortSignature(a)).toBe("createdAt:desc,title:asc");
    expect(sortSignature(a)).not.toBe(sortSignature(b));
  });

  it("differs when a direction flips", () => {
    expect(sortSignature([{ fieldId: "x", direction: "asc" }])).not.toBe(
      sortSignature([{ fieldId: "x", direction: "desc" }]),
    );
  });

  it("is empty for an unsorted view", () => {
    expect(sortSignature([])).toBe("");
  });
});

describe("encode/decode round-trip", () => {
  const sig = "createdAt:desc,id:asc";

  it("round-trips a mixed scalar tuple (string, number, null)", () => {
    const values = ["hello", 42, null];
    const decoded = decodeCursor(encodeCursor(values, sig));
    expect(decoded.v).toEqual(values);
    expect(decoded.s).toBe(sig);
  });

  it("revives a Date as a real Date with identical instant", () => {
    const d = new Date("2026-06-28T12:34:56.789Z");
    const decoded = decodeCursor(encodeCursor([d, "tail"], sig));
    const [back, tail] = decoded.v;
    expect(back).toBeInstanceOf(Date);
    expect((back as Date).toISOString()).toBe(d.toISOString());
    expect(tail).toBe("tail");
  });

  it("round-trips a tuple of multiple Dates and a null", () => {
    const d1 = new Date("2020-01-01T00:00:00.000Z");
    const d2 = new Date("2030-12-31T23:59:59.000Z");
    const decoded = decodeCursor(encodeCursor([d1, null, d2], sig));
    expect((decoded.v[0] as Date).toISOString()).toBe(d1.toISOString());
    expect(decoded.v[1]).toBeNull();
    expect((decoded.v[2] as Date).toISOString()).toBe(d2.toISOString());
  });

  it("produces a url-safe string (base64url: no +, /, =)", () => {
    const enc = encodeCursor([new Date(), "a/b+c", 1], sig);
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("preserves the sort signature verbatim", () => {
    const decoded = decodeCursor(encodeCursor([1], "weird:sig,with:asc"));
    expect(decoded.s).toBe("weird:sig,with:asc");
  });
});

describe("decodeCursor validation", () => {
  it("throws on non-base64 garbage", () => {
    // base64url-decodes to bytes that are not valid JSON.
    expect(() => decodeCursor("!!!!notjson!!!!")).toThrow();
  });

  it("throws when payload shape is wrong", () => {
    const bad = Buffer.from(JSON.stringify({ nope: true })).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow("Invalid cursor payload");
  });
});
