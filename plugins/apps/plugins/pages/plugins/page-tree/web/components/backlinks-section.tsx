import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import { backlinksResource } from "@plugins/page/plugins/links/core";
import { pageDetailPane } from "../panes";

// "Linked from" section contributed into PageDetail.Section. The slot passes
// `{ pageId }` and owns the card + title; navigation is injected so the pure
// Backlinks domain component stays decoupled from this app's panes.
export function BacklinksSection({ pageId }: { pageId: string }) {
  const openPane = useOpenPane();
  return (
    <Backlinks
      documentId={pageId}
      onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
    />
  );
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
