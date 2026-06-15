import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  Breadcrumb,
  type BreadcrumbSegment,
} from "@plugins/primitives/plugins/breadcrumb/web";
import { pagesResource, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
 * Notion-style ancestor trail shown above the page header. Each ancestor is a
 * clickable segment; the current page is the inert trailing leaf. Renders
 * nothing for root pages (no ancestors) or while the pages resource loads.
 */
export function PageBreadcrumb({ pageId }: { pageId: string }): ReactElement | null {
  const openPane = useOpenPane();
  const result = useResource(pagesResource);
  if (result.pending) return null;

  const current = result.data.find((p) => p.id === pageId);
  if (!current) return null;
  const ancestors = pageAncestors(result.data, pageId);
  if (ancestors.length === 0) return null;

  const chain = [...ancestors, current];
  const segments: BreadcrumbSegment[] = chain.map((page) => ({
    key: page.id,
    label: <SegmentLabel page={page} />,
  }));

  return (
    <Text as="div" variant="caption" tone="muted" className="px-xs">
      <Breadcrumb
        segments={segments}
        onNavigate={(_i, seg) =>
          openPane(pageDetailPane, { pageId: seg.key }, { mode: "swap" })
        }
      />
    </Text>
  );
}
