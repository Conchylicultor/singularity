import { useLive } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import { pageBacklinks } from "@plugins/page/plugins/links/core";

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
 *
 * While the value is still pending the card is not painted either: the gate is
 * a boolean the host resolves before painting, and no card is the one answer
 * that claims nothing about the page — the card appears once the backlinks
 * settle non-empty, never an empty card that then fills. A failed read DOES
 * paint the card: its body renders the failure with Retry.
 */
export function useHasBacklinks({ pageId }: { pageId: string }): boolean {
  const result = useLive(pageBacklinks, { pageId });
  return foldResource(result, {
    loading: () => false,
    error: () => true,
    ready: (links) => links.length > 0,
  });
}
