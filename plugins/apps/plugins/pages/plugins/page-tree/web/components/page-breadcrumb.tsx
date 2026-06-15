import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  Breadcrumb,
  type BreadcrumbSegment,
} from "@plugins/primitives/plugins/breadcrumb/web";
import { pagesResource, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageAncestors } from "../ancestors";
import { pageDetailPane } from "../panes";

function SegmentLabel({ page }: { page: Block }): ReactElement {
  const data = pageData(page);
  return (
    <span className="inline-flex items-center gap-2xs">
      <PageIcon nodes={data.iconSvgNodes} className="size-3.5 shrink-0" />
      {data.title || "Untitled"}
    </span>
  );
}

/**
 * Notion-style ancestor trail rendered in the page pane's chrome title bar — the
 * single home for the page's title. Ancestors are clickable segments; the
 * current page is the inert trailing leaf, so the big in-body title is the only
 * other place the title appears. A root page with no ancestors still shows its
 * own title as the lone segment; renders nothing only while the pages resource
 * loads. Typography size is owned by PaneChrome's title container — this trail
 * carries only the per-segment weight/color baked into the Breadcrumb primitive,
 * never its own size or inset.
 */
export function PageBreadcrumb({ pageId }: { pageId: string }): ReactElement | null {
  const openPane = useOpenPane();
  const result = useResource(pagesResource);
  if (result.pending) return null;

  const current = result.data.find((p) => p.id === pageId);
  if (!current) return null;
  const ancestors = pageAncestors(result.data, pageId);

  const chain = [...ancestors, current];
  const segments: BreadcrumbSegment[] = chain.map((page) => ({
    key: page.id,
    label: <SegmentLabel page={page} />,
  }));

  return (
    <Breadcrumb
      segments={segments}
      onNavigate={(_i, seg) =>
        openPane(pageDetailPane, { pageId: seg.key }, { mode: "swap" })
      }
    />
  );
}
