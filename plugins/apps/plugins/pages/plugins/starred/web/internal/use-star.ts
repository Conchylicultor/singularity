import type React from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { putPageStarred } from "../../shared/endpoints";
import { starredPagesResource } from "../../shared/resources";

/** Shared read + toggle logic for both star toggle surfaces (row + header). */
export function useStar(pageId: string) {
  const result = useResource(starredPagesResource);
  const { mutateAsync } = useEndpointMutation(putPageStarred);
  const isStarred = !result.pending && result.data.some((r) => r.parentId === pageId);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await mutateAsync({ params: { pageId }, body: { starred: !isStarred } });
  };

  return { isStarred, toggle, pending: result.pending };
}
