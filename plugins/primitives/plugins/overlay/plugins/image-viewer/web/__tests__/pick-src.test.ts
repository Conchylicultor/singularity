import { afterEach, describe, expect, it, vi } from "vitest";
import { createDecodedCache } from "../internal/decoded-cache";
import { pickSrc, shownEdge } from "../internal/pick-src";
import type { ViewerImage } from "../internal/types";

const resized = (edge: number) => `copy@${edge}`;
const big: ViewerImage = {
  src: "orig",
  name: "a.jpg",
  width: 6720,
  height: 4480,
  resized,
};

afterEach(() => vi.restoreAllMocks());

describe("pickSrc", () => {
  it("takes a copy when the original is larger than the edge", () => {
    expect(pickSrc(big, 1280, true)).toBe("copy@1280");
  });
  it("takes the original when it is no larger", () => {
    expect(pickSrc(big, 8000, true)).toBe("orig");
  });
  it("takes the original when no copy is offered", () => {
    expect(pickSrc({ ...big, resized: undefined }, 100, true)).toBe("orig");
  });
  it("uses a copy of unknown size only where size does not matter", () => {
    const unknown: ViewerImage = { src: "orig", name: "a.jpg", resized };
    expect(pickSrc(unknown, 320, true)).toBe("orig");
    expect(pickSrc(unknown, 320, false)).toBe("copy@320");
  });
});

describe("shownEdge", () => {
  it("is the fitted long edge in device pixels, never enlarged", () => {
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    expect(
      shownEdge({ width: 6720, height: 4480 }, { width: 1440, height: 900 }),
    ).toBe(2700);
    expect(
      shownEdge({ width: 100, height: 50 }, { width: 1440, height: 900 }),
    ).toBe(200);
    expect(
      shownEdge({ width: 100, height: 50 }, { width: 1440, height: 900 }, 3),
    ).toBe(600);
  });
});

describe("createDecodedCache", () => {
  /** jsdom's Image never loads: stand in a decode that resolves at once. */
  function fakeImages() {
    const made: string[] = [];
    // jsdom has no decode(): define one for these tests.
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      writable: true,
      value(this: HTMLImageElement) {
        made.push(this.src);
        return this.src.endsWith("bad")
          ? Promise.reject(new DOMException("no", "EncodingError"))
          : Promise.resolve();
      },
    });
    return made;
  }

  it("decodes a URL once while it stays cached", async () => {
    const made = fakeImages();
    const cache = createDecodedCache(2);
    await cache.load("http://x/a");
    await cache.load("http://x/a");
    expect(made).toEqual(["http://x/a"]);
  });

  it("drops the least recently used past its size", async () => {
    const made = fakeImages();
    const cache = createDecodedCache(2);
    await cache.load("http://x/a");
    await cache.load("http://x/b");
    await cache.load("http://x/a");
    await cache.load("http://x/c"); // evicts b
    await cache.load("http://x/a");
    await cache.load("http://x/b");
    expect(made).toEqual([
      "http://x/a",
      "http://x/b",
      "http://x/c",
      "http://x/b",
    ]);
  });

  it("rejects a failed load and does not keep it", async () => {
    const made = fakeImages();
    const cache = createDecodedCache(2);
    await expect(cache.load("http://x/bad")).rejects.toThrow("no");
    await expect(cache.load("http://x/bad")).rejects.toThrow("no");
    expect(made).toHaveLength(2);
  });
});
