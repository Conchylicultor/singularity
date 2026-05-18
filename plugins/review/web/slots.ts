import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

export const Review = defineDetailSections<{ conversationId: string }>("review", {
  collapsible: true,
  defaultOpen: true,
});
