import type { BlockCreateHook } from "@plugins/page/plugins/editor/server";
import { PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/core";
import { originOf } from "@plugins/infra/plugins/request-origin/core";
import { pageBlocksOrigin } from "./tables";

/**
 * `BlockLifecycle.AfterCreate` contributor: stamps a marker row on every page
 * block created by an automated session, so agent pages can be segregated into
 * their own sidebar section and swept after 24h.
 *
 * Only `type === "page"` blocks are marked — `createPageWithSeed` issues two
 * `POST /api/blocks` calls per "Blank page" click (the page row, then a seed
 * text block), and only the first is a page, so exactly one marker is minted
 * per page. Nested agent pages are marked too, not just roots: the tree's own
 * root-inheritance handles display, and an honest per-row marker keeps the
 * sweep simple.
 *
 * The stamp is awaited and never caught: a failure fails the create loudly
 * rather than silently minting an unmarked, unswept page.
 */
export const agentOriginCreateHook: BlockCreateHook = {
  async afterCreate(block, req) {
    // `originOf` owns the "declares itself agent-written but names no script"
    // case: the mark is what matters, the attribution is a nicety. The reverse
    // is NOT true — a missing origin header means DO NOT stamp.
    const origin = originOf(req);
    if (origin.kind !== "agent") return;
    if (block.type !== PAGE_BLOCK_TYPE) return;
    await pageBlocksOrigin.upsert(block.id, { source: origin.source });
  },
};
