import { MdDescription } from "react-icons/md";
import type { IconType } from "react-icons";
import { SvgIcon } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";

export interface PageIconProps {
  /** The page's stored icon SVG tree, or null/undefined for no icon. */
  nodes: SvgNode[] | null | undefined;
  /** Glyph shown when the page has no icon. Defaults to a document icon. */
  fallback?: IconType;
  /** Tailwind size class, applied to both the icon and the fallback. */
  className?: string;
}

/**
 * The single renderer for a page's icon across every surface — header, sidebar,
 * page links, backlinks, and the page picker — so they all stay identical.
 * Renders the stored {@link SvgNode} tree when present, else a fallback glyph.
 */
export function PageIcon({
  nodes,
  fallback: Fallback = MdDescription,
  className = "size-4",
}: PageIconProps) {
  return nodes != null && nodes.length > 0 ? (
    <SvgIcon nodes={nodes} className={className} />
  ) : (
    <Fallback className={className} />
  );
}
