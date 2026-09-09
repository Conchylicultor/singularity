import { describe, expect, test } from "bun:test";
import { externalUrl } from "./external-url";

describe("externalUrl", () => {
  test("an absolute http(s) URL passes through verbatim", () => {
    expect(externalUrl("https://cdn.example.test/poster.jpg")).toBe(
      "https://cdn.example.test/poster.jpg",
    );
    expect(externalUrl("http://cdn.example.test/poster.jpg")).toBe(
      "http://cdn.example.test/poster.jpg",
    );
  });

  test("absent, or not an ordinary web address, is neither a src nor a destination", () => {
    expect(externalUrl(null)).toBe(null);
    expect(externalUrl("")).toBe(null);
    expect(externalUrl("/relative/poster.jpg")).toBe(null);
    expect(externalUrl("data:image/svg+xml,<svg/>")).toBe(null);
    expect(externalUrl("javascript:alert(1)")).toBe(null);
  });
});
