import type { BlockCreateHook } from "@plugins/page/plugins/editor/server";
import { PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/core";
import { pageBlocksOrigin } from "./tables";

// The provenance signal, set by the e2e harness on every request its browser
// context issues (`e2e-harness/e2e/browser.ts`). Duplicated as literals there
// rather than imported: the harness is generic build tooling and must not take
// a dependency on a Pages sub-plugin. See
// research/2026-07-29-global-agent-origin-provenance-for-pages.md.
const ORIGIN_HEADER = "x-singularity-origin";
const ORIGIN_SOURCE_HEADER = "x-singularity-origin-source";
const AGENT_ORIGIN = "agent";
// A request that declares itself agent-written but names no script is still
// agent-written — the mark is what matters, the attribution is a nicety. The
// reverse is NOT true: a missing origin header means DO NOT stamp.
const UNKNOWN_SOURCE = "agent";

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
    if (req.headers.get(ORIGIN_HEADER) !== AGENT_ORIGIN) return;
    if (block.type !== PAGE_BLOCK_TYPE) return;
    const source = req.headers.get(ORIGIN_SOURCE_HEADER) ?? UNKNOWN_SOURCE;
    await pageBlocksOrigin.upsert(block.id, { source });
  },
};
