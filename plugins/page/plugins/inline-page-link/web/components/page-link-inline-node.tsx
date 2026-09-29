import type { LexicalNode } from "lexical";
import {
  ResourceErrorInline,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  pagesResource,
  pageData,
  type PageRow,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { usePageNavigation } from "@plugins/page/plugins/page-reference/web";
import { pageLinkInlineNode } from "../../core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const linkIcon = symbol("link");

/**
 * The browser half of the inline page-link token: the SAME family declared in
 * `core/node.ts`, with rendering added. Everything structural — the type string,
 * the `__pageId` property, the token format, the empty `getTextContent()` — is
 * inherited from that one declaration.
 */
export const pageLinkInlineWebNode = pageLinkInlineNode.decorated({
  className: "inline-flex align-baseline",
  render: ({ pageId }) => <PageLinkInlineView pageId={pageId} />,
});

/** The Lexical class to register in a block editor's `nodes` config. */
export const PageLinkInlineNode = pageLinkInlineWebNode.Node;

function PageLinkInlineView({ pageId }: { pageId: string }) {
  const nav = usePageNavigation();
  const result = useResource(pagesResource);

  // A failed read that once had the page set keeps resolving from it;
  // without one, the chip is the failure (an icon, to keep the line intact).
  let pages: readonly PageRow[];
  switch (result.status) {
    case "loading":
      // Render nothing while the pages resource is loading.
      return null;
    case "error":
      if (result.stale === undefined) {
        return (
          <ResourceErrorInline
            error={result.error}
            refetch={result.refetch}
            variant="icon"
            icon={linkIcon}
            subject="the linked page"
          />
        );
      }
      pages = result.stale;
      break;
    case "ready":
      pages = result.data;
  }

  const target = pages.find((d) => d.id === pageId);
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
        <Center as="span" className="size-3.5">
          <PageIcon
            icon={data?.icon}
            fallback={linkIcon}
            className="size-3.5"
          />
        </Center>
      }
      onClick={(e) => {
        e.stopPropagation();
        nav?.open(pageId);
      }}
    >
      {data?.title || "Untitled"}
    </LinkChip>
  );
}

export function $createPageLinkInlineNode(pageId: string): LexicalNode {
  return pageLinkInlineWebNode.create({ pageId });
}
