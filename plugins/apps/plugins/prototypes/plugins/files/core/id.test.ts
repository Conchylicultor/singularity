import { describe, expect, test } from "bun:test";
import { isPrototypeId, newPrototypeId, PROTOTYPE_ID_RE } from "./id";

// The pin that keeps the mint and the readers of the format together. Every
// consumer — the folder-name problem in `validate.ts`, the active-data chip's
// `inlineBoundary(PROTOTYPE_ID_RE)` — derives from these two exports, so a mint
// that stops satisfying them fails HERE instead of silently switching the chips
// off, which is precisely the `att-`/`block-` failure this module exists to
// avoid.

describe("newPrototypeId", () => {
  test("every minted id is a valid prototype id", () => {
    for (let i = 0; i < 500; i++) {
      const id = newPrototypeId();
      expect(isPrototypeId(id)).toBe(true);
      expect(new RegExp(PROTOTYPE_ID_RE.source).test(id)).toBe(true);
    }
  });

  test("mints the documented shape", () => {
    for (let i = 0; i < 500; i++) {
      const [prefix, epoch, suffix] = newPrototypeId().split("-");
      expect(prefix).toBe("proto");
      expect(Number(epoch)).toBeGreaterThan(1_700_000_000);
      // Exactly four characters, always — the reason this mint zero-pads an
      // integer rather than slicing `Math.random().toString(36)`.
      expect(suffix).toHaveLength(4);
    }
  });

  test("ids are distinct within one second", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPrototypeId()));
    // 36^4 ≈ 1.7M suffixes; 200 draws collide with probability ~1%. Assert the
    // mint is random at all, not that it is collision-free — a collision is
    // handled by re-minting in `shared/mint.ts`, not prevented here.
    expect(ids.size).toBeGreaterThan(150);
  });
});

describe("isPrototypeId", () => {
  test("rejects the hand-made folder names it exists to catch", () => {
    for (const name of [
      "ember",
      "improve-quiet",
      "control-panel-studies",
      "_template",
      "proto",
      "proto-",
      "proto-abc-1234",
      "proto-1787215770-3i6",
      "proto-1787215770-3i6vv",
      "proto-1787215770-3I6V",
      // Anchored: an id embedded in a longer string is not a folder name.
      "x-proto-1787215770-3i6v",
      "proto-1787215770-3i6v/index.html",
      " proto-1787215770-3i6v",
    ]) {
      expect(isPrototypeId(name)).toBe(false);
    }
  });

  test("accepts a minted-shape id", () => {
    expect(isPrototypeId("proto-1787215770-3i6v")).toBe(true);
    expect(isPrototypeId("proto-1-0000")).toBe(true);
  });
});
