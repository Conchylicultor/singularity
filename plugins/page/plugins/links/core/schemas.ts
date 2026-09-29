import { z } from "zod";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";

// One referencing (source) page in a target page's backlinks list. Carries
// just enough to render a clickable row: the source page's id, title, and the
// page's icon (a Material Symbols name; null when the page has no icon).
export const BacklinkRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: SavedSymbolNameSchema.nullable(),
});
export type BacklinkRow = z.infer<typeof BacklinkRowSchema>;

// One raw (source page → target page) edge from the page_links index.
// Consumers needing the hierarchy-wide link graph (the pages sidebar showing
// linked pages as reference children) subscribe to the full edge list.
export const PageLinkEdgeSchema = z.object({
  sourcePageId: z.string(),
  targetPageId: z.string(),
});
export type PageLinkEdge = z.infer<typeof PageLinkEdgeSchema>;
