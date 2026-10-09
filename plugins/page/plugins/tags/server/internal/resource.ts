import { serveCollection } from "@plugins/network/plugins/live/server";
import { pageTagAssignments, pageTagVocabulary } from "../../core";
import { pageBlocksTags, pageTags } from "./tables";

// Both collections are served straight from their entities: the vocabulary
// from `page_tags` (its wire columns — `nameKey` stays server-side), the
// assignments from the `page_blocks_ext_tags` extension (`pageId` is its
// `parent_id` key). Tagging a page is one entrant or one refill, clearing it an
// exit; renaming a tag is one vocabulary refill and touches no page.
export const pageTagVocabularyServed = serveCollection(pageTagVocabulary, {
  from: pageTags,
});

export const pageTagAssignmentsServed = serveCollection(pageTagAssignments, {
  from: pageBlocksTags,
});
