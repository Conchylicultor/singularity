import { describe, expect, it } from "bun:test";
import { majorDegree } from "./degree";

describe("majorDegree", () => {
  it("reads each scale degree off the root, relative to the tonic", () => {
    expect([0, 2, 4, 5, 7, 9, 11].map((pc) => majorDegree(pc, 0))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("transposes with the tonic", () => {
    // In G (tonic 7): D is V, C is IV, F♯ is vii.
    expect(majorDegree(2, 7)).toBe(4);
    expect(majorDegree(0, 7)).toBe(3);
    expect(majorDegree(6, 7)).toBe(6);
  });

  it("reads pitch classes mod 12", () => {
    expect(majorDegree(14, 0)).toBe(1);
    expect(majorDegree(-1, 0)).toBe(6);
    expect(majorDegree(0, 12)).toBe(0);
  });

  it("has none for a root outside the major scale", () => {
    for (const pc of [1, 3, 6, 8, 10]) expect(majorDegree(pc, 0)).toBeNull();
    // ♭VII in G is F.
    expect(majorDegree(5, 7)).toBeNull();
  });
});
