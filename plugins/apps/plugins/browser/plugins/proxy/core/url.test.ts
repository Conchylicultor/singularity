import { describe, expect, it } from "bun:test";
import { parseMetaRefresh } from "./url";

describe("parseMetaRefresh", () => {
  it("parses delay + url", () => {
    expect(parseMetaRefresh("5; url=https://example.com/x")).toEqual({
      delayMs: 5000,
      url: "https://example.com/x",
    });
  });

  it("treats a 0 delay as immediate", () => {
    expect(parseMetaRefresh("0;url=/next")).toEqual({
      delayMs: 0,
      url: "/next",
    });
  });

  it("is case-insensitive on the url= key", () => {
    expect(parseMetaRefresh("1; URL=/a")?.url).toBe("/a");
  });

  it("tolerates whitespace around the separator and key", () => {
    expect(parseMetaRefresh("  2 ;  url =  /a  ")).toEqual({
      delayMs: 2000,
      url: "/a",
    });
  });

  it("strips a single layer of surrounding quotes", () => {
    expect(parseMetaRefresh("0; url='https://e.com/q'")?.url).toBe(
      "https://e.com/q",
    );
    expect(parseMetaRefresh('0; url="https://e.com/q"')?.url).toBe(
      "https://e.com/q",
    );
  });

  it("rounds fractional-second delays", () => {
    expect(parseMetaRefresh("1.5; url=/a")?.delayMs).toBe(1500);
  });

  it("returns null for a bare delay (same-document reload)", () => {
    expect(parseMetaRefresh("5")).toBeNull();
    expect(parseMetaRefresh("0")).toBeNull();
  });

  it("returns null for an empty or malformed value", () => {
    expect(parseMetaRefresh("")).toBeNull();
    expect(parseMetaRefresh("5; foo=bar")).toBeNull();
    expect(parseMetaRefresh("5; url=")).toBeNull();
  });

  it("keeps a url containing query separators intact", () => {
    expect(parseMetaRefresh("0; url=/p?a=1&b=2")?.url).toBe("/p?a=1&b=2");
  });
});
