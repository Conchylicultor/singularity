import { createElement } from "react";
import type { ReactNode } from "react";
import { MdCampaign } from "react-icons/md";
import type { AvatarSpec } from "@plugins/config_v2/plugins/fields/plugins/avatar/core";
import { cn } from "@/lib/utils";

type SvgNode = NonNullable<AvatarSpec["svgNodes"]>[number];

function renderSvgNodes(nodes: SvgNode[]): ReactNode {
  return nodes.map((node, i) =>
    createElement(
      node.tag,
      { key: i, ...node.attr },
      node.child.length > 0 ? renderSvgNodes(node.child) : undefined,
    ),
  );
}

// Renders a preprompt's icon as a bare, muted glyph (no coloured disc) directly
// from an AvatarSpec's pre-rendered svg nodes. When the spec carries no icon a
// default glyph (MdCampaign) renders, so a preprompt is *always* visibly
// marked. This is the single source of the preprompt marker look — the picker
// and the conversation snapshot chip both render through it so the marker reads
// identically everywhere. The picked colour is intentionally dropped: markers
// read as neutral status, not as a coloured label.
export function PrepromptGlyph({
  icon,
  className,
}: {
  icon: AvatarSpec | null | undefined;
  className?: string;
}) {
  const nodes = icon?.svgNodes;
  if (!nodes?.length) {
    return <MdCampaign aria-hidden className={cn("size-3.5 shrink-0", className)} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      {renderSvgNodes(nodes)}
    </svg>
  );
}
