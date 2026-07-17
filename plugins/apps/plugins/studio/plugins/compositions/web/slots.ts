import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

export const CompositionDetail = defineDetailSections<{ id: string }>(
  "composition-detail",
  { collapsible: true, defaultOpen: true },
);
