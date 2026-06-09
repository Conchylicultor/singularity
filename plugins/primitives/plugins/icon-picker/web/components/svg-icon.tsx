import { createElement } from "react";
import type { SvgNode } from "../../core";

function renderNodes(nodes: SvgNode[]): React.ReactNode {
  return nodes.map((node, i) =>
    createElement(
      node.tag,
      { key: i, ...node.attr },
      node.child.length > 0 ? renderNodes(node.child) : undefined,
    ),
  );
}

export interface SvgIconProps {
  nodes: SvgNode[];
  className?: string;
}

/**
 * Render a stored {@link SvgNode} tree as a raw `<svg>`. Display-only surfaces
 * use this to show a picked icon without importing the ~2 000-icon react-icons
 * bundle. Inherits color via `fill="currentColor"`; size it with `className`
 * (e.g. `"size-4"`).
 */
export function SvgIcon({ nodes, className }: SvgIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {renderNodes(nodes)}
    </svg>
  );
}
