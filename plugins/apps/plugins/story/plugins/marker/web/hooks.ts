import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { storiesResource, type StoryMark } from "../shared/schemas";

export function useIsStory(pageId: string | null | undefined): boolean {
  const result = useResource(storiesResource);
  if (!pageId || result.pending) return false;
  return pageId in result.data;
}

export function useStories(): StoryMark[] {
  const result = useResource(storiesResource);
  return result.pending ? [] : Object.values(result.data);
}
