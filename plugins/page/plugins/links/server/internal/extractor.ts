import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// Per-block-type link-extractor registry (collection-consumer separation).
// Each block-type plugin contributes `PageLinks.Extractor({ type, extract })`;
// the reindexer dispatches generically by `block.type` over the collected
// extractors and NEVER names a block type. `extract(data)` returns the target
// document ids this block links to.
export interface PageLinkExtractor {
  type: string;
  extract: (data: unknown) => string[];
}

export const PageLinks = {
  Extractor: defineServerContribution<PageLinkExtractor>("page.links.extractor", {
    docLabel: (props) => props.type,
  }),
};
