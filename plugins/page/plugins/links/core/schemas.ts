import { z } from "zod";
import { EmojiSchema } from "@plugins/ui/plugins/icons/plugins/emoji/core";

// Where the link sits in the source page: an excerpt of the linking block's
// text as a person reads it (inline tokens shown as their titles), split around
// the target's title so the view can mark it. `before` / `after` are already
// trimmed to a short window around the match, with `…` where text was cut.
export const BacklinkSnippetSchema = z.object({
  before: z.string(),
  match: z.string(),
  after: z.string(),
});
export type BacklinkSnippet = z.infer<typeof BacklinkSnippetSchema>;

// One referencing (source) page in a target page's backlinks list. Carries
// just enough to render a clickable row: the source page's id, title, and the
// page's icon (an emoji; null when the page has no icon), where it sits in the
// page tree (`path`: its ancestor pages' titles, root first; empty for a root
// page), plus the snippet of
// its FIRST linking block in document order — null when that block IS the link
// (a page-link block, whose only text is the target's name) or its text never
// names the target.
export const BacklinkRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: EmojiSchema.nullable(),
  path: z.array(z.string()),
  snippet: BacklinkSnippetSchema.nullable(),
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
