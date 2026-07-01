import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { addBookmark, deleteBookmark } from "../../shared/endpoints";
import {
  browserBookmarksResource,
  type BookmarkRow,
} from "../../core/resources";

/**
 * Shared read + mutate logic for the bookmark surfaces (star toggle + bar).
 * Wraps the live `browser-bookmarks` resource and the add/delete endpoints.
 *
 * The raw `ResourceResult` is exposed (never collapsed into a fake-empty list)
 * so consumers gate on `.pending` themselves — `matchResource` in the bar, the
 * `&&`-guarded helpers below for the star.
 */
export function useBookmarks(): {
  result: ResourceResult<BookmarkRow[]>;
  isBookmarked: (url: string) => boolean;
  toggle: (url: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const result = useResource(browserBookmarksResource);
  const { mutateAsync: add } = useEndpointMutation(addBookmark);
  const { mutateAsync: del } = useEndpointMutation(deleteBookmark);

  const isBookmarked = (url: string) =>
    !result.pending && result.data.some((b) => b.url === url);

  const toggle = async (url: string, title: string) => {
    const existing = !result.pending && result.data.find((b) => b.url === url);
    if (existing) {
      await del({ params: { id: existing.id } });
    } else {
      await add({ body: { url, title } });
    }
  };

  const remove = async (id: string) => {
    await del({ params: { id } });
  };

  return { result, isBookmarked, toggle, remove };
}
