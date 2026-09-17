import { describe, expect, it } from "bun:test";
import { SAMPLE_PINNED_SECTIONS, isInSample } from "./sample";
import { isInLoadScope, resolveLoadScope } from "./scope";

describe("load scope", () => {
  it("resolves auto from the host singleton, and leaves an explicit setting alone", () => {
    expect(resolveLoadScope("auto", true)).toBe("full");
    expect(resolveLoadScope("auto", false)).toBe("sample");
    expect(resolveLoadScope("full", false)).toBe("full");
    expect(resolveLoadScope("sample", true)).toBe("sample");
  });

  it("keeps everything in full, and the sample rule in sample", () => {
    const song = {
      id: "qveoYyGGodn",
      artistSlug: "adam-lambert",
      songSlug: "whataya-want-from-me",
    };
    expect(isInLoadScope("full", song)).toBe(true);
    expect(isInLoadScope("sample", song)).toBe(isInSample(song));
  });

  it("places an entry with no known song only by a pinned id", () => {
    const pinned = Object.keys(SAMPLE_PINNED_SECTIONS)[0] ?? "";
    expect(
      isInLoadScope("sample", { id: pinned, artistSlug: null, songSlug: null }),
    ).toBe(true);
    expect(
      isInLoadScope("sample", {
        id: "notpinned01",
        artistSlug: null,
        songSlug: null,
      }),
    ).toBe(false);
    expect(
      isInLoadScope("full", {
        id: "notpinned01",
        artistSlug: null,
        songSlug: null,
      }),
    ).toBe(true);
  });
});
