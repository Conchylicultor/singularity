import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const mapIcon = symbol("map");

export const MAP_TYPE = "map";

/**
 * Empty on purpose: what the map shows is DERIVED from the page's other blocks
 * on every render, never stored, so it cannot drift from the page.
 */
export const MapDataSchema = z.object({});
export type MapData = z.infer<typeof MapDataSchema>;

export const mapBlock = defineBlock({
  type: MAP_TYPE,
  schema: MapDataSchema,
  label: "Map",
  icon: mapIcon,
  aliases: ["places map", "map of places", "locations"],
  empty: () => ({}),
  // `<map/>` — a void block (no `text` key) with nothing of its own to say, so
  // it self-closes; a body on parse is a loud rejection rather than a silent drop.
  markdown: {
    tag: {
      name: MAP_TYPE,
      body: "none",
      attrs: () => ({}),
      parseAttrs: () => ({}),
    },
  },
});
