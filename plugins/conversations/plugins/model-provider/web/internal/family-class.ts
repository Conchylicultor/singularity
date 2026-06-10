import type { ModelTier } from "../../core";

/**
 * Tailwind chip classes for a model family/tier. Single owner of the family color map.
 * Uses the categorical palette: fable→categorical-4 (amber), opus→categorical-5 (violet),
 * sonnet→categorical-1 (sky), haiku→categorical-2 (emerald). Tinted-chip convention:
 * bg-categorical-N/15 text-categorical-N.
 */
const FAMILY_CLASS: Record<ModelTier, string> = {
  fable: "bg-categorical-4/15 text-categorical-4",
  opus: "bg-categorical-5/15 text-categorical-5",
  sonnet: "bg-categorical-1/15 text-categorical-1",
  haiku: "bg-categorical-2/15 text-categorical-2",
};

export function familyClass(family: ModelTier): string {
  return FAMILY_CLASS[family];
}
