import { describe, expect, it } from "bun:test";
import {
  SAMPLE_BUCKETS,
  SAMPLE_PINNED_SECTIONS,
  fnv1a32,
  isInSample,
  sampleBucket,
} from "./sample";

describe("the worktree sample", () => {
  it("hashes with FNV-1a, stable across runs and runtimes", () => {
    // Reference values of 32-bit FNV-1a over UTF-8.
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("the-beatles\nlet-it-be")).toBe(2995485822);
    expect(
      sampleBucket({ artistSlug: "the-beatles", songSlug: "let-it-be" }),
    ).toBe(2995485822 % SAMPLE_BUCKETS);
  });

  it("keeps a song's sections together", () => {
    const song = {
      artistSlug: "adam-lambert",
      songSlug: "whataya-want-from-me",
    };
    const verdicts = ["qveoYyGGodn", "aaaaaaaaaaa", "zzzzzzzzzzz"].map((id) =>
      isInSample({ id, ...song }),
    );
    expect(new Set(verdicts).size).toBe(1);
  });

  it("takes about one song in twenty", () => {
    let inSample = 0;
    const songs = 20_000;
    for (let i = 0; i < songs; i++) {
      if (
        sampleBucket({
          artistSlug: `artist-${i % 997}`,
          songSlug: `song-${i}`,
        }) === 0
      )
        inSample++;
    }
    expect(inSample / songs).toBeGreaterThan(0.04);
    expect(inSample / songs).toBeLessThan(0.06);
  });

  it("always takes a pinned section, whatever its song hashes to", () => {
    for (const id of Object.keys(SAMPLE_PINNED_SECTIONS)) {
      let outOfBucket = 0;
      while (
        sampleBucket({ artistSlug: "x", songSlug: `s${outOfBucket}` }) === 0
      )
        outOfBucket++;
      expect(
        isInSample({ id, artistSlug: "x", songSlug: `s${outOfBucket}` }),
      ).toBe(true);
    }
  });
});
