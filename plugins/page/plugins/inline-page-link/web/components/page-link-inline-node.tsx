import { MdLink } from "react-icons/md";
import type { LexicalNode } from "lexical";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { usePageNavigation } from "@plugins/page/plugins/page-reference/web";
import { pageLinkInlineNode } from "../../core";

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

  // Gate: render nothing while the pages resource is loading.
  if (result.pending) return null;

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
        <Center as="span" className="size-3.5">
          <PageIcon
            nodes={data?.iconSvgNodes}
            fallback={MdLink}
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
