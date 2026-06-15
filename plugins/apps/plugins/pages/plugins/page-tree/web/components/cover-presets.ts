// Frozen registry of preset gradient covers. A gradient cover stores only its
// preset `id`; the CSS is resolved here at render time so the stored payload
// stays tiny and presets can be re-tuned without a data migration. Unknown ids
// fall back to the first preset (graceful, never blank).

export interface CoverGradient {
  id: string;
  label: string;
  /** A CSS `background` value (a `linear-gradient(...)` string). */
  css: string;
}

// The default preset, also the graceful fallback for unknown ids. Named as a
// const so the registry is provably non-empty (no `[0]` undefined narrowing).
const DEFAULT_GRADIENT: CoverGradient = {
  id: "sunset",
  label: "Sunset",
  css: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 50%, #fbc2eb 100%)",
};

export const COVER_GRADIENTS: readonly CoverGradient[] = Object.freeze([
  DEFAULT_GRADIENT,
  { id: "dusk", label: "Dusk", css: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)" },
  { id: "forest", label: "Forest", css: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
  { id: "ember", label: "Ember", css: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)" },
  { id: "aurora", label: "Aurora", css: "linear-gradient(135deg, #00c6ff 0%, #0072ff 50%, #7b2ff7 100%)" },
  { id: "peach", label: "Peach", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "grape", label: "Grape", css: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  { id: "slate", label: "Slate", css: "linear-gradient(135deg, #485563 0%, #29323c 100%)" },
  { id: "mint", label: "Mint", css: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" },
]);

/**
 * Resolve a gradient preset id to its CSS `background` value. Falls back to the
 * default preset for unknown ids so a stale/typo'd id never renders blank.
 */
export function gradientCss(presetId: string): string {
  const match = COVER_GRADIENTS.find((g) => g.id === presetId);
  return (match ?? DEFAULT_GRADIENT).css;
}
