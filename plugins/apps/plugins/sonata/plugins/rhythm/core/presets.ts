/**
 * The preset rhythm table.
 *
 * These are the *literal* preset onset arrays extracted verbatim from the
 * minified bundle of https://rhythm-circle.com/ (`/assets/index-lguHv3YL.js`;
 * a Vue 2 SPA with no sourcemap). Each entry is a fixed-length onset list at a
 * fixed pulse count — exactly as the site stores it.
 *
 * Note on subdivisions: the site does **no** resampling. Selecting a preset
 * snaps that ring's subdivision count to the preset's native length and copies
 * the array 1:1 by index (its own highlight check bails out when
 * `pattern.length != circle.ndiv`). Polyrhythm on the site comes from three
 * rings holding different pulse counts, never from reprojecting a pattern. Our
 * `resample()` in `pattern.ts` is an *addition* the site lacks — not a port of
 * anything in the bundle.
 */

import type { NamedRhythm } from "./pattern";

export const RHYTHMS: NamedRhythm[] = [
  { id: "tresillo", label: "Tresillo", subdivisions: 8, onsets: [0, 3, 6] },
  { id: "son", label: "Son", subdivisions: 16, onsets: [0, 3, 6, 10, 12] },
  { id: "shiko", label: "Shiko", subdivisions: 16, onsets: [0, 4, 6, 10, 12] },
  { id: "soukous", label: "Soukous", subdivisions: 16, onsets: [0, 3, 6, 10, 11] },
  { id: "rumba", label: "Rumba", subdivisions: 16, onsets: [0, 3, 6, 11, 12] },
  { id: "bossa-nova", label: "Bossa Nova", subdivisions: 16, onsets: [0, 3, 6, 10, 13] },
  { id: "gahu", label: "Gahu", subdivisions: 16, onsets: [0, 3, 6, 10, 14] },
  { id: "samba", label: "Samba", subdivisions: 16, onsets: [0, 3, 5, 7, 10, 12, 14] },
  { id: "fume-fume", label: "Fume Fume", subdivisions: 12, onsets: [0, 2, 4, 7, 9] },
  { id: "bembe", label: "Bembé", subdivisions: 12, onsets: [0, 2, 4, 5, 7, 9, 11] },
  { id: "steve-reich", label: "Steve Reich", subdivisions: 12, onsets: [0, 1, 2, 4, 5, 7, 8, 10] },
  { id: "basic-1", label: "Basic 1", subdivisions: 8, onsets: [0] },
  { id: "basic-2", label: "Basic 2", subdivisions: 8, onsets: [0, 4] },
  { id: "basic-3", label: "Basic 3", subdivisions: 12, onsets: [0, 4, 8] },
  { id: "basic-4", label: "Basic 4", subdivisions: 16, onsets: [0, 4, 8, 12] },
];

/** Look up a named rhythm by id; throws loudly on an unknown id. */
export function findRhythm(id: string): NamedRhythm {
  const r = RHYTHMS.find((x) => x.id === id);
  if (!r) throw new Error(`[rhythm] unknown rhythm: ${id}`);
  return r;
}
