import { describe, expect, it } from "bun:test";
import { keyboardWindowFor } from "./keyboard-window";

const DEFAULT = { low: 48, high: 84 };

describe("keyboardWindowFor", () => {
  it("shows C3–C6 with nothing to fit", () => {
    expect(keyboardWindowFor([])).toEqual(DEFAULT);
  });

  it("leaves the window alone for a chord inside it", () => {
    // C major with its bass near middle C, as `chordVoicing` places it.
    expect(keyboardWindowFor([60, 64, 67])).toEqual(DEFAULT);
  });

  it("keeps the window for notes exactly on its edges", () => {
    expect(keyboardWindowFor([48, 84])).toEqual(DEFAULT);
  });

  it("widens downward by a whole octave for a note below", () => {
    expect(keyboardWindowFor([47, 60, 64])).toEqual({ low: 36, high: 84 });
  });

  it("widens upward by a whole octave for a note above", () => {
    expect(keyboardWindowFor([60, 64, 85])).toEqual({ low: 48, high: 96 });
  });

  it("widens both ends when notes fall past both", () => {
    expect(keyboardWindowFor([40, 60, 90])).toEqual({ low: 36, high: 96 });
  });

  it("keeps widening for a note more than an octave outside", () => {
    expect(keyboardWindowFor([20, 100])).toEqual({ low: 12, high: 108 });
  });

  it("never shifts: a low chord widens rather than slides", () => {
    const { low, high } = keyboardWindowFor([36, 40, 43]);
    expect(low).toBe(36);
    // The top stays where it was — the window grew, it did not move.
    expect(high).toBe(DEFAULT.high);
  });
});
