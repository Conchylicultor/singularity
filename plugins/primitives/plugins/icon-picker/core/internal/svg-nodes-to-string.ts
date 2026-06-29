import type { SvgNode } from "../index";

/** Escape a string for safe use inside an XML/SVG attribute value. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialize a stored {@link SvgNode} tree to an SVG/XML string. The runtime-
 * agnostic counterpart of the React `renderNodes` in `web/components/svg-icon`:
 * same tags, same attrs, same recursion over `child`. Pure and synchronous, so
 * non-React consumers (favicon/Tauri-icon rasterization) can build raw markup.
 */
export function svgNodesToString(nodes: SvgNode[]): string {
  return nodes
    .map((node) => {
      const attrs = Object.entries(node.attr)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join("");
      if (node.child.length === 0) {
        return `<${node.tag}${attrs}/>`;
      }
      return `<${node.tag}${attrs}>${svgNodesToString(node.child)}</${node.tag}>`;
    })
    .join("");
}
