import type { BlockDeleteHook } from "@plugins/page/plugins/editor/server";

// A deleted subtree's outgoing page_links edges are FK-cascade-wiped. The
// affected target pages' backlinks panels refresh automatically: the cascade
// DELETE on page_links is invalidated by the L4 DB change-feed, which fans out
// to every dependent backlinksResource key. No hand-snapshot / re-push needed.
export const backlinksDeleteHook: BlockDeleteHook = {
  beforeDelete: () => undefined,
};
