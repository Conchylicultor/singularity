import { z } from "zod";
import { MdBookmark } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const BOOKMARK_TYPE = "bookmark";

export const bookmarkBlock = defineBlock({
  type: BOOKMARK_TYPE,
  schema: z.object({
    url: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    siteName: z.string().optional(),
    imageId: z.string().optional(),
    faviconId: z.string().optional(),
    // True once the server-side link-preview fetch has completed (success or
    // error). Gates the loading→preview transition: a bookmark with a url but
    // !fetched is in the "fetching" state and auto-runs the scrape once.
    fetched: z.boolean().optional(),
    // Mirror of [imageId, faviconId] so the shared block↔attachment reconcile
    // links the cached images (otherwise they get orphan-swept). Convention:
    // a block's managed attachments live in data.attachmentId / data.attachmentIds.
    attachmentIds: z.array(z.string()).optional(),
  }),
  label: "Bookmark",
  icon: MdBookmark,
  aliases: ["link", "preview", "card", "url"],
  empty: () => ({}), // no url → URL-input placeholder UI
});
