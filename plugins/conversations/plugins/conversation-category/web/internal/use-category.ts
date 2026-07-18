import { usePointResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationCategoriesResource } from "../../shared";

// One O(1) point sub for this conversation's category — replaces the O(n) `.find`
// over the whole-collection resource. Called per row in the sidebar list; the
// live-state keep-alive + sub-batch absorb the per-row sub churn (the decided
// default for this virtualized-row shape). `null` on the settled arm is
// determinate (no category classified yet); pending also reads as `null` so the
// chip falls back to its title-glyph until the one post-mount round-trip lands.
export function useCategoryFor(conversationId: string): string | null {
  const result = usePointResource(conversationCategoriesResource, conversationId);
  if (result.pending) return null;
  return result.data?.category ?? null;
}
