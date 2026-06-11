import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { storiesResource, type StoryMark } from "../shared/schemas";

export function useIsStory(pageId: string | null | undefined): boolean {
  const result = useResource(storiesResource);
  if (!pageId || result.pending) return false;
  return pageId in result.data;
}

/**
 * All story marks as an array.
 *
 * NOTE: returns `[]` while the resource is pending. Consumers that render
 * lists (e.g. story-gallery) must gate on the resource themselves via
 * `useResource(storiesResource)` or `useCombinedResources` to distinguish
 * "still loading" from "genuinely no stories". story-editor.tsx is a known
 * out-of-list consumer that also uses this hook but tolerates the brief
 * null-defaultRendererId flash on first load.
 */
export function useStories(): StoryMark[] {
  const result = useResource(storiesResource);
  if (result.pending) return [];
  return Object.values(result.data);
}
