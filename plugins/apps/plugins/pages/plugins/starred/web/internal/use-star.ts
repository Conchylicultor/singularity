import type React from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { putPageStarred } from "../../shared/endpoints";
import { useStarredPageIds } from "./use-starred-ids";

/** Shared read + toggle logic for both star toggle surfaces (row + header). */
export function useStar(pageId: string) {
  const { ids, pending } = useStarredPageIds();
  const { mutateAsync } = useEndpointMutation(putPageStarred);
  const isStarred = ids.has(pageId);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await mutateAsync({ params: { pageId }, body: { starred: !isStarred } });
  };

  return { isStarred, toggle, pending };
}
