import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export type {
  ContributionNodeAttrs,
  RegionNodeAttrs,
} from "./internal/lineage-attrs";
export {
  appendLineage,
  contributionNodeAttrs,
  LINEAGE_ATTR,
  NODE_ATTR,
  parseLineage,
  readLineageNode,
  regionNodeAttrs,
} from "./internal/lineage-attrs";
export { collectLineage } from "./internal/collect-lineage";
export { collectMeta } from "./internal/collect-meta";
export { UiRegion } from "./internal/ui-region";

export default {
  description:
    "The UI-context lineage: the node model (contribution | region), its DOM attribute grammar, the portal-crossing chain helpers, the <UiRegion> producer, the collectLineage walk, and the <ui-context> token (collectMeta / serialize / parse). A neutral leaf so both improve/element-picker and reports/render-loop can ask 'what composed this element?' without either depending on the other.",
  contributions: [],
} satisfies PluginDefinition;
