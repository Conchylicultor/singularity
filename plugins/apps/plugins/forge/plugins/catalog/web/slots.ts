import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export interface CatalogCategoryProps {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  getCount: (plugins: PluginNode[]) => number;
  component: ComponentType<{ plugins: PluginNode[]; filter: string }>;
}

export const Catalog = {
  Category: defineSlot<CatalogCategoryProps>("catalog.category", {
    docLabel: (p) => p.label,
  }),
};
