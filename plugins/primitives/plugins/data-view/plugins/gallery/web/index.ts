import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGridView } from "react-icons/md";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { GalleryView } from "./components/gallery-view";

export { DataCard } from "./components/data-card";
export type { DataCardProps } from "./components/data-card";
export type { GalleryViewOptions } from "../core";
export { galleryOptions } from "../core";

export default {
  description:
    "Gallery view child for the data-view primitive: a responsive card grid with a field-driven default card plus a composable DataCard chrome.",
  contributions: [
    DataViewSlots.View({
      id: "gallery",
      title: "Gallery",
      icon: MdGridView,
      order: 0,
      component: GalleryView,
    }),
  ],
} satisfies PluginDefinition;
