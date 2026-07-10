import { describe, expect, test } from "bun:test";

import {
  effectiveOnsets,
  patternFromPreset,
  resample,
  rotate,
  toggleOnset,
} from "./pattern";
import { RHYTHMS, findRhythm } from "./presets";

describe("effectiveOnsets", () => {
  test("applies a positive rotation, wrapping around the bar", () => {
    const p = { ...patternFromPreset("son"), rotation: 2 };
    // [0,3,6,10,12] + 2 (mod 16) = [2,5,8,12,14]
    expect(effectiveOnsets(p)).toEqual([2, 5, 8, 12, 14]);
  });

  test("applies a negative rotation via floored modulo", () => {
    const p = { ...patternFromPreset("son"), rotation: -1 };
    // [0,3,6,10,12] - 1 (mod 16) = [15,2,5,9,11] -> sorted
    expect(effectiveOnsets(p)).toEqual([2, 5, 9, 11, 15]);
  });

  test("with zero rotation returns the raw onsets, sorted", () => {
    expect(effectiveOnsets(patternFromPreset("bossa-nova"))).toEqual([
      0, 3, 6, 10, 13,
    ]);
  });
});

describe("rotate", () => {
  test("is cyclic: rotating by a full bar restores the effective onsets", () => {
    const p = patternFromPreset("son");
    const full = rotate(p, p.subdivisions);
    expect(effectiveOnsets(full)).toEqual(effectiveOnsets(p));
  });

  test("normalizes rotation into [0, subdivisions)", () => {
    const p = patternFromPreset("son"); // subdivisions 16
    expect(rotate(p, 20).rotation).toBe(4);
    expect(rotate(p, -3).rotation).toBe(13);
  });

  test("preserves presetId (label stays 'Son ⟳n')", () => {
    expect(rotate(patternFromPreset("son"), 2).presetId).toBe("son");
  });

  test("does not mutate the input", () => {
    const p = patternFromPreset("son");
    const before = { ...p, onsets: [...p.onsets] };
    rotate(p, 5);
    expect(p.rotation).toBe(before.rotation);
    expect(p.onsets).toEqual(before.onsets);
  });
});

describe("resample", () => {
  test("maps Son@16 -> [0,2,5,8,9]@12 (round(i*12/16))", () => {
    const out = resample(patternFromPreset("son"), 12);
    expect(out.subdivisions).toBe(12);
    expect(out.onsets).toEqual([0, 2, 5, 8, 9]);
  });

  test("preserves presetId (label reads 'Son (adapted)')", () => {
    expect(resample(patternFromPreset("son"), 12).presetId).toBe("son");
  });

  test("dedupes collisions and never emits an index >= n", () => {
    // Downsample a dense 16-pulse pattern to 4 pulses: many onsets collide.
    const dense = { ...patternFromPreset("samba"), subdivisions: 16 };
    const out = resample(dense, 4);
    const unique = new Set(out.onsets);
    expect(unique.size).toBe(out.onsets.length); // no duplicates
    for (const o of out.onsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(4);
    }
  });

  test("rescales rotation proportionally", () => {
    const p = { ...patternFromPreset("son"), rotation: 8 }; // 16 pulses
    // round(8 * 12 / 16) = round(6) = 6, mod 12 = 6
    expect(resample(p, 12).rotation).toBe(6);
  });

  test("clamps n to [1, 48]", () => {
    expect(resample(patternFromPreset("son"), 100).subdivisions).toBe(48);
    expect(resample(patternFromPreset("son"), 1).subdivisions).toBe(1);
  });

  test("throws on a non-positive or non-integer n", () => {
    expect(() => resample(patternFromPreset("son"), 0)).toThrow();
    expect(() => resample(patternFromPreset("son"), -4)).toThrow();
    expect(() => resample(patternFromPreset("son"), 12.5)).toThrow();
  });

  test("does not mutate the input", () => {
    const p = patternFromPreset("son");
    const before = { ...p, onsets: [...p.onsets] };
    resample(p, 12);
    expect(p.subdivisions).toBe(before.subdivisions);
    expect(p.onsets).toEqual(before.onsets);
  });
});

describe("toggleOnset", () => {
  test("nulls presetId when a bead is toggled", () => {
    expect(toggleOnset(patternFromPreset("son"), 5).presetId).toBeNull();
  });

  test("round-trips: toggling the same index twice restores the onsets", () => {
    const p = patternFromPreset("son");
    const twice = toggleOnset(toggleOnset(p, 5), 5);
    expect([...twice.onsets].sort((a, b) => a - b)).toEqual(
      [...p.onsets].sort((a, b) => a - b),
    );
  });

  test("removes an existing onset (effective == raw when rotation 0)", () => {
    const p = patternFromPreset("son"); // onsets [0,3,6,10,12]
    expect(toggleOnset(p, 3).onsets).toEqual([0, 6, 10, 12]);
  });

  test("adds a new onset, kept sorted", () => {
    const p = patternFromPreset("son");
    expect(toggleOnset(p, 5).onsets).toEqual([0, 3, 5, 6, 10, 12]);
  });

  test("maps the effective index back through rotation", () => {
    const p = { ...patternFromPreset("son"), rotation: 2 };
    // effective 5 -> raw (5 - 2) mod 16 = 3, which exists -> removed
    expect(toggleOnset(p, 5).onsets).toEqual([0, 6, 10, 12]);
  });

  test("does not mutate the input", () => {
    const p = patternFromPreset("son");
    const before = [...p.onsets];
    toggleOnset(p, 5);
    expect(p.onsets).toEqual(before);
  });
});

describe("findRhythm", () => {
  test("throws on an unknown id", () => {
    expect(() => findRhythm("nope")).toThrow("[rhythm] unknown rhythm: nope");
  });

  test("returns the named rhythm for a known id", () => {
    expect(findRhythm("son").label).toBe("Son");
  });
});

describe("RHYTHMS table invariants", () => {
  test("every entry has sorted, unique onsets all < subdivisions", () => {
    for (const r of RHYTHMS) {
      const sorted = [...r.onsets].sort((a, b) => a - b);
      expect(r.onsets).toEqual(sorted); // already sorted ascending
      expect(new Set(r.onsets).size).toBe(r.onsets.length); // unique
      for (const o of r.onsets) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThan(r.subdivisions);
      }
      expect(r.subdivisions).toBeGreaterThanOrEqual(1);
      expect(r.subdivisions).toBeLessThanOrEqual(48);
    }
  });

  test("all ids are unique", () => {
    const ids = RHYTHMS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
