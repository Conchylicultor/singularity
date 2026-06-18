import { registerFieldResolver } from "@plugins/fields/core";
import type { SvgNode } from "@plugins/fields/plugins/avatar/core";
import { resolveIconSvgNodes } from "@plugins/primitives/plugins/icon-picker/server";

registerFieldResolver("avatar", (val) => {
  const spec = val as { icon: string | null; color: string | null; svgNodes?: SvgNode[] | null };
  if (spec.svgNodes != null && spec.svgNodes.length > 0) return spec;
  return { ...spec, svgNodes: spec.icon ? resolveIconSvgNodes(spec.icon) : null };
});
