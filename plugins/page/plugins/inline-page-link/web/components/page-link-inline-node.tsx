import type { ReactNode } from "react";
import { MdLink } from "react-icons/md";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { useBlockEditor, PageIcon } from "@plugins/page/plugins/editor/web";

type SerializedPageLinkInlineNode = {
  type: "page-link-inline";
  version: 1;
  pageId: string;
};

/**
 * An inline, non-editable reference to another page, rendered as a clickable
 * chip. Lives inside a text block's Lexical tree; persists as a `[[<pageId>]]`
 * token in the block's text (see core's token helpers). Its own `getTextContent()`
 * stays empty so the token never leaks into live root-text reads (slash menu, the
 * `[[` query scan) — serialization happens via the extension's `serializeNode`.
 */
export class PageLinkInlineNode extends DecoratorNode<ReactNode> {
  __pageId: string;

  static getType(): string {
    return "page-link-inline";
  }

  static clone(node: PageLinkInlineNode): PageLinkInlineNode {
    return new PageLinkInlineNode(node.__pageId, node.__key);
  }

  constructor(pageId: string, key?: NodeKey) {
    super(key);
    this.__pageId = pageId;
  }

  static importJSON(json: SerializedPageLinkInlineNode): PageLinkInlineNode {
    return new PageLinkInlineNode(json.pageId);
  }

  exportJSON(): SerializedPageLinkInlineNode {
    return { type: "page-link-inline", version: 1, pageId: this.__pageId };
  }

  isInline(): true {
    return true;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "inline-flex align-baseline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getPageId(): string {
    return this.__pageId;
  }

  decorate(): ReactNode {
    return <PageLinkInlineView pageId={this.__pageId} />;
  }
}

function PageLinkInlineView({ pageId }: { pageId: string }) {
  const { onOpenPage } = useBlockEditor();
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
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <PageIcon nodes={data?.iconSvgNodes} fallback={MdLink} className="size-3.5" />
        </span>
      }
      onClick={(e) => {
        e.stopPropagation();
        onOpenPage?.(pageId);
      }}
    >
      {data?.title || "Untitled"}
    </LinkChip>
  );
}

export function $createPageLinkInlineNode(pageId: string): PageLinkInlineNode {
  return new PageLinkInlineNode(pageId);
}

export function $isPageLinkInlineNode(
  node: LexicalNode | null | undefined,
): node is PageLinkInlineNode {
  return node instanceof PageLinkInlineNode;
}
