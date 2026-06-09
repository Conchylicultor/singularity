import type { SvgNode } from "../../core";
import { ICON_SVG_MAP } from "./icon-svg-map.generated";

export function resolveIconSvgNodes(iconKey: string): SvgNode[] | null {
  return (ICON_SVG_MAP[iconKey] as SvgNode[] | undefined) ?? null;
}

export async function resolveIconSvgNodesJson(iconKey: string): Promise<string | null> {
  const nodes = resolveIconSvgNodes(iconKey);
  return nodes ? JSON.stringify(nodes) : null;
}
