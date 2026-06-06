import { createElement } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  ConversationPreprompt,
  PrepromptIcon as PrepromptIconSpec,
} from "../../shared";

type SvgNode = NonNullable<NonNullable<PrepromptIconSpec>["svgNodes"]>[number];

function renderSvgNodes(nodes: SvgNode[]): ReactNode {
  return nodes.map((node, i) =>
    createElement(
      node.tag,
      { key: i, ...node.attr },
      node.child.length > 0 ? renderSvgNodes(node.child) : undefined,
    ),
  );
}

// Renders a preprompt's chosen icon as a bare, muted glyph, sourced from the
// conversation's launch-time snapshot. The picked colour is intentionally
// dropped in the conversation view — markers read as neutral status (like the
// op-status build/push glyphs), not as a coloured label. When the preprompt
// has no icon, renders `fallback` (the header chip passes its default glyph;
// the sidebar marker passes nothing so unset preprompts stay unadorned).
export function PrepromptIcon({
  record,
  className,
  fallback = null,
}: {
  record: ConversationPreprompt;
  className?: string;
  fallback?: ReactNode;
}) {
  const nodes = record.icon?.svgNodes;
  if (!nodes?.length) return <>{fallback}</>;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("size-3.5", className)}
    >
      {renderSvgNodes(nodes)}
    </svg>
  );
}
