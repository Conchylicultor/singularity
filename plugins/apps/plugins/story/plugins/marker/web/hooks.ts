import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { storiesResource, type StoryMark } from "../shared/schemas";

export function useIsStory(pageId: string | null | undefined): boolean {
  const result = useResource(storiesResource);
  if (!pageId || result.pending) return false;
  return pageId in result.data;
}

/**
 * All story marks as a gateable result. Returns the raw pending result while
 * loading (never collapses to `[]`) so consumers can distinguish "still loading"
 * from "genuinely no stories" — gate with matchResource/ResourceView, or
 * combine with other resources via useCombinedResources.
 */
export function useStories(): ResourceResult<StoryMark[]> {
  const result = useResource(storiesResource);
  // The payload is a Record keyed by pageId; expose it as an array. The pending
  // arm's `stale` (last-known-good) is that same Record, so map it too — its
  // shape must match the array return type.
  if (result.pending) {
    return {
      ...result,
      stale: result.stale ? Object.values(result.stale) : undefined,
    };
  }
  return { ...result, data: Object.values(result.data) };
}
