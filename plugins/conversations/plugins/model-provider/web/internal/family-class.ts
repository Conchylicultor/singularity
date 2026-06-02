import type { ModelTier } from "../../core";

/**
 * Tailwind chip classes for a model family/tier. Single owner of the family color map.
 * Uses the categorical palette: opus→categorical-5 (violet), sonnet→categorical-1 (sky),
 * haiku→categorical-2 (emerald). Tinted-chip convention: bg-categorical-N/15 text-categorical-N.
 */
const FAMILY_CLASS: Record<ModelTier, string> = {
  opus: "bg-categorical-5/15 text-categorical-5",
  sonnet: "bg-categorical-1/15 text-categorical-1",
  haiku: "bg-categorical-2/15 text-categorical-2",
};

export function familyClass(family: ModelTier): string {
  return FAMILY_CLASS[family];
}
