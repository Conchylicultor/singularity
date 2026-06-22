import { describe, expect, it } from "bun:test";
import { extractUgTabId } from "./tab-url";
import { UgFetchError } from "./errors";

describe("extractUgTabId", () => {
  it("extracts a trailing hyphen-segment id", () => {
    expect(
      extractUgTabId(
        "https://tabs.ultimate-guitar.com/tab/ed-sheeran/perfect-chords-1956589",
      ),
    ).toBe("1956589");
  });

  it("extracts a bare numeric /tab/<id> path", () => {
    expect(extractUgTabId("https://fr.ultimate-guitar.com/tab/3250376")).toBe(
      "3250376",
    );
  });

  it("extracts a www host hyphen-segment id", () => {
    expect(
      extractUgTabId("https://www.ultimate-guitar.com/tab/some-song-12345"),
    ).toBe("12345");
  });

  it("extracts an explicit ?id= query param", () => {
    expect(
      extractUgTabId("https://www.ultimate-guitar.com/tab/foo?id=12345"),
    ).toBe("12345");
  });

  it("tolerates a trailing slash", () => {
    expect(
      extractUgTabId("https://fr.ultimate-guitar.com/tab/3250376/"),
    ).toBe("3250376");
  });

  it("rejects a non-UG host", () => {
    let err: unknown;
    try {
      extractUgTabId("https://example.com/tab/perfect-chords-1956589");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UgFetchError);
    expect((err as UgFetchError).kind).toBe("invalid-url");
  });

  it("rejects a lookalike host (not a real UG subdomain)", () => {
    let err: unknown;
    try {
      extractUgTabId("https://ultimate-guitar.com.evil.com/tab/123");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UgFetchError);
    expect((err as UgFetchError).kind).toBe("invalid-url");
  });

  it("rejects a UG URL with no id", () => {
    let err: unknown;
    try {
      extractUgTabId("https://www.ultimate-guitar.com/explore");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UgFetchError);
    expect((err as UgFetchError).kind).toBe("invalid-url");
  });

  it("rejects garbage that is not a URL", () => {
    let err: unknown;
    try {
      extractUgTabId("not a url at all");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UgFetchError);
    expect((err as UgFetchError).kind).toBe("invalid-url");
  });
});
