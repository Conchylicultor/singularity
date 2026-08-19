import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import { backlinksResource } from "@plugins/page/plugins/links/core";

// "Linked from" section contributed into PageDetail.Section. The slot passes
// `{ pageId }` and owns the card + title. Navigation is not passed down: the
// section renders inside the pane's own `PageNavigationProvider`, the same seam
// the page's reference blocks read, so a backlink row and a sub-page row open a
// page the same way by construction.
export function BacklinksSection({ pageId }: { pageId: string }) {
  return <Backlinks documentId={pageId} />;
}

/**
 * The section's `useAvailable` gate: a page with no inbound links paints no card
 * at all. This has to be a gate rather than a `return null` in the body — the
 * host owns the chrome, so a null body would leave an empty "Linked from" card
 * on every page in the app.
 */
export function useHasBacklinks({ pageId }: { pageId: string }): boolean {
  const result = useResource(backlinksResource, { pageId });
  return !result.pending && result.data.length > 0;
}
