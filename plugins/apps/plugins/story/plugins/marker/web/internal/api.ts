import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setStoryMark, clearStoryMark } from "../../shared/endpoints";

export async function markStory(
  pageId: string,
  defaultRendererId: string | null = null,
): Promise<void> {
  await fetchEndpoint(setStoryMark, { pageId }, { body: { defaultRendererId } });
}

export async function unmarkStory(pageId: string): Promise<void> {
  await fetchEndpoint(clearStoryMark, { pageId });
}
