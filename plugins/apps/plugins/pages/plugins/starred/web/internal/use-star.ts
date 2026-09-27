import type React from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { putPageStarred } from "../../shared/endpoints";
import { useStarredPageIds } from "./use-starred-ids";

/**
 * Shared read + toggle logic for both star toggle surfaces (row + header).
 * Pending until the favorites window lands: a toggle whose flip is computed
 * from a guess would star an already-starred page instead of unstarring it.
 */
export function useStar(pageId: string):
  | { pending: true }
  | {
      pending: false;
      isStarred: boolean;
      toggle: (e: React.MouseEvent) => Promise<void>;
    } {
  const starred = useStarredPageIds();
  const { mutateAsync } = useEndpointMutation(putPageStarred);
  if (starred.pending) return { pending: true };
  const isStarred = starred.ids.has(pageId);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await mutateAsync({ params: { pageId }, body: { starred: !isStarred } });
  };

  return { pending: false, isStarred, toggle };
}
