import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import type { ReviewProps } from "./source";

export const Review = defineDetailSections<ReviewProps>("review", {
  collapsible: true,
  defaultOpen: true,
});
