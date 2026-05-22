import { registerFieldResolver } from "@plugins/config_v2/core";
import type { SvgNode } from "@plugins/config_v2/plugins/fields/plugins/avatar/core";
import { ICON_SVG_MAP } from "./icon-svg-map.generated";

registerFieldResolver("avatar", (val) => {
  const spec = val as { icon: string | null; color: string | null; svgNodes?: SvgNode[] | null };
  if (spec.svgNodes != null && spec.svgNodes.length > 0) return spec;
  return { ...spec, svgNodes: spec.icon ? (ICON_SVG_MAP[spec.icon] ?? null) : null };
});
