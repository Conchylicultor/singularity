import { describe, expect, it } from "bun:test";
import { snapPlaybackRate } from "./playback-rate";

const YT = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

describe("snapPlaybackRate", () => {
  it("takes the nearest supported rate", () => {
    expect(snapPlaybackRate(0.7, 1, YT)).toBe(0.75);
    expect(snapPlaybackRate(1.9, 1, YT)).toBe(2);
    expect(snapPlaybackRate(4, 1, YT)).toBe(2);
  });

  it("moves at least one step toward a request off the current rate", () => {
    expect(snapPlaybackRate(1.05, 1, YT)).toBe(1.25);
    expect(snapPlaybackRate(0.95, 1, YT)).toBe(0.75);
    expect(snapPlaybackRate(2.1, 2, YT)).toBe(2);
    expect(snapPlaybackRate(0.2, 0.25, YT)).toBe(0.25);
  });

  it("keeps the current rate when it is what was asked", () => {
    expect(snapPlaybackRate(1, 1, YT)).toBe(1);
  });

  it("throws when the player supports no rate", () => {
    expect(() => snapPlaybackRate(1, 1, [])).toThrow();
  });
});
