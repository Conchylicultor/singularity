import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

export const ThemeCustomizer = defineDetailSections<{ search: string }>(
  "theme-customizer",
);
