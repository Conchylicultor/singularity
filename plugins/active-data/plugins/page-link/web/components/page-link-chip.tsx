import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import {
  pagesResource,
  pageData,
  getBlockPage,
  type PageRow,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/**
 * A raw `block-…` id rendered as a chip that opens the page displaying it.
 *
 * Resolution is two-tiered, and the tiers are not interchangeable:
 *
 * - `pagesResource` — already subscribed app-wide, carries every `type="page"`
 *   row. A PAGE id (the common case: what a URL and the sidebar expose) is
 *   answered from it for free, with no request and live-updating titles.
 * - `getBlockPage` — the reverse lookup for a CONTENT block, which the pages
 *   resource structurally cannot answer (it holds no content rows). Fired only
 *   on a resource miss, so a transcript full of page links costs zero requests.
 *
 * Unresolvable ids render as the plain raw string: the pattern is a guess about
 * prose, and a chip that opens nothing is worse than the text the model wrote.
 */
export function PageLinkChip({ content }: { content: string; attrs: Record<string, string> }) {
  const blockId = content.trim();
  const result = useResource(pagesResource);

  return matchResource(result, {
    // The raw text as written until the page set is known — the same render as
    // "no such page", because until it loads that is what we honestly know.
    pending: () => <>{blockId}</>,
    ready: (pages) => <ResolvedPageLink blockId={blockId} pages={pages} />,
  });
}

function ResolvedPageLink({ blockId, pages }: { blockId: string; pages: PageRow[] }) {
  const openPane = useOpenPane();
  const pageRow = pages.find((p) => p.id === blockId);

  const lookup = useEndpoint(
    getBlockPage,
    { id: blockId },
    {
      // Only a content-block id costs a round trip (see above).
      enabled: pageRow === undefined,
      // Ids are immutable and a block's page changes only on a cross-page move,
      // so one lookup per id per session is plenty.
      staleTime: 5 * 60_000,
    },
  );

  const targetId = pageRow?.id ?? (lookup.data?.found === true ? lookup.data.pageId : undefined);
  // The chip labels itself with the TARGET page's title, whether the id named
  // that page or a block inside it.
  const target = targetId === undefined ? undefined : pages.find((p) => p.id === targetId);

  // Nothing to open (or not resolved yet): the raw string exactly as written,
  // unstyled — a font change would advertise an affordance that isn't there.
  if (target === undefined || targetId === undefined) return <>{blockId}</>;

  const data = pageData(target);
  const title = data.title || "Untitled";
  const isPage = pageRow !== undefined;

  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        // `push` opens the page as a column to the RIGHT of the surface holding
        // the text (a conversation, another page) instead of replacing it —
        // `pageDetailRoute` has no parent, so nothing else is stacked with it.
        openPane(pageDetailPane, { pageId: targetId }, { mode: "push" });
      }}
      title={isPage ? `${title} · ${blockId}` : `${title} · block ${blockId}`}
      // `icon-auto`: the chip's slot owns the glyph size (PageIcon otherwise
      // defaults to a fixed size-4, which would override it).
      leading={<PageIcon nodes={data.iconSvgNodes} className="icon-auto" />}
    >
      {title}
    </LinkChip>
  );
}
