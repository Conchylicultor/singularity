import { ICON_SVG_MAP } from "./icon-svg-map.generated";

export function resolveIconSvgNodes(iconKey: string): unknown[] | null {
  return ICON_SVG_MAP[iconKey] ?? null;
}

export async function resolveIconSvgNodesJson(iconKey: string): Promise<string | null> {
  const nodes = resolveIconSvgNodes(iconKey);
  return nodes ? JSON.stringify(nodes) : null;
}
