import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Row,
  type RowProps,
  type RowSize,
  type RowHover,
} from "./internal/row";
export {
  SectionHeaderRow,
  type SectionHeaderRowProps,
  type SectionHeaderVariant,
} from "./internal/section-header-row";

export default {
  name: "Row",
  description:
    "Generic interactive row primitive (list, menu, nav, tree, and collapsible section-header rows) with a sanctioned home so ad-hoc rounded+padded interactive markup routes through one primitive.",
  contributions: [],
} satisfies PluginDefinition;
