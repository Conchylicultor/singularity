import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import {
  useBlockTarget,
  useBlockTargetTitle,
  useOpenBlockTarget,
} from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/**
 * A raw `block-…` id rendered as a chip that opens what it names: a page id
 * opens the page, a content-block id opens that block as a page of its own (the
 * block view), both as a column beside the surface holding the text.
 *
 * Resolution is page-tree's `useBlockTarget` — a page id answered from the live
 * pages list for free, a content block by one reverse lookup fired only on a
 * miss, so a transcript full of page links costs zero requests.
 *
 * Unresolvable ids render as the plain raw string: the pattern is a guess about
 * prose, and a chip that opens nothing is worse than the text the model wrote.
 */
export function PageLinkChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const blockId = content.trim();
  const target = useBlockTarget(blockId);
  const title = useBlockTargetTitle(target);
  const pages = useResource(pagesResource);
  const open = useOpenBlockTarget();

  // Nothing to open, or not resolved yet: the raw string exactly as written,
  // unstyled — a font change would advertise an affordance that isn't there.
  // Until it resolves that is also all we honestly know.
  if (target.kind !== "page" && target.kind !== "block") return <>{blockId}</>;
  if (pages.pending) return <>{blockId}</>;
  const page = pages.data.find((p) => p.id === target.pageId);
  if (title === undefined || page === undefined) return <>{blockId}</>;

  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        open(target);
      }}
      title={
        target.kind === "page"
          ? `${title} · ${blockId}`
          : `${title} · block ${blockId}`
      }
      // `icon-auto`: the chip's slot owns the glyph size (PageIcon otherwise
      // defaults to a fixed size-4, which would override it).
      leading={
        <PageIcon nodes={pageData(page).iconSvgNodes} className="icon-auto" />
      }
    >
      {title}
    </LinkChip>
  );
}
