import type { ModelTier } from "../../core";

/**
 * Tailwind chip classes for a model family/tier. Single owner of the family color map,
 * ported verbatim from launch-prompts-button.tsx (purple for opus, blue for sonnet),
 * with a muted/green chip for the haiku tier.
 */
const FAMILY_CLASS: Record<ModelTier, string> = {
  opus: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  sonnet: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  haiku: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export function familyClass(family: ModelTier): string {
  return FAMILY_CLASS[family];
}
