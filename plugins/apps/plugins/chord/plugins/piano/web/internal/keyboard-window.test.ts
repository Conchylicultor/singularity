import { describe, expect, it } from "bun:test";
import { keyboardWindowFor } from "./keyboard-window";

const DEFAULT = { low: 36, high: 84 };

describe("keyboardWindowFor", () => {
  it("shows C2–C6 with nothing to fit", () => {
    expect(keyboardWindowFor([])).toEqual(DEFAULT);
  });

  it("leaves the window alone for a chord inside it", () => {
    // C major with its bass near middle C, as `chordVoicing` places it, and
    // the bass `chordSound` doubles an octave under it.
    expect(keyboardWindowFor([48, 60, 64, 67])).toEqual(DEFAULT);
  });

  it("leaves the window alone for the lowest bass the app can double", () => {
    // `chordVoicing` pins a chord's own bass to F♯3–F4, so the doubled bass
    // never falls below F♯2 (42) — inside the default window by six semitones.
    expect(keyboardWindowFor([42, 54, 58, 61])).toEqual(DEFAULT);
  });

  it("keeps the window for notes exactly on its edges", () => {
    expect(keyboardWindowFor([36, 84])).toEqual(DEFAULT);
  });

  it("widens downward by a whole octave for a note below", () => {
    expect(keyboardWindowFor([35, 60, 64])).toEqual({ low: 24, high: 84 });
  });

  it("widens upward by a whole octave for a note above", () => {
    expect(keyboardWindowFor([60, 64, 85])).toEqual({ low: 36, high: 96 });
  });

  it("widens both ends when notes fall past both", () => {
    expect(keyboardWindowFor([28, 60, 90])).toEqual({ low: 24, high: 96 });
  });

  it("keeps widening for a note more than an octave outside", () => {
    expect(keyboardWindowFor([8, 100])).toEqual({ low: 0, high: 108 });
  });

  it("never shifts: a low chord widens rather than slides", () => {
    const { low, high } = keyboardWindowFor([24, 28, 31]);
    expect(low).toBe(24);
    // The top stays where it was — the window grew, it did not move.
    expect(high).toBe(DEFAULT.high);
  });
});
