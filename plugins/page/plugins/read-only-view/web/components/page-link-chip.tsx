import { MdLink } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";

/**
 * Read-only equivalent of the editor's inline page-link chip
 * (`PageLinkInlineView`). Resolves the linked page's title + icon from the live
 * `pagesResource` and renders the same `LinkChip` shape — but never navigates
 * (no `onOpenPage` editor context in a static render), so `onClick` is a pure
 * `stopPropagation`. A consumer that wants navigation can wrap the rendered
 * output in its own click handler; the preview layer stays inert by design.
 */
export function PageLinkChip({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);

  if (result.pending) {
    // Show the raw token-free title placeholder rather than nothing, so the
    // line height stays stable while the resource loads.
    return (
      <LinkChip onClick={(e) => e.stopPropagation()}>
        <Placeholder>…</Placeholder>
      </LinkChip>
    );
  }

  const target = result.data.find((d) => d.id === pageId);
  const data = target ? pageData(target) : undefined;

  if (!target) {
    return (
      <LinkChip onClick={(e) => e.stopPropagation()}>
        <Placeholder>(page not found)</Placeholder>
      </LinkChip>
    );
  }

  return (
    <LinkChip
      leading={
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <PageIcon nodes={data?.iconSvgNodes} fallback={MdLink} className="size-3.5" />
        </span>
      }
      onClick={(e) => e.stopPropagation()}
    >
      {data?.title || "Untitled"}
    </LinkChip>
  );
}
