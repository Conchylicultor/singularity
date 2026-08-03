import noAdhocForestWrite from "./no-adhoc-forest-write";
import noAdhocStructuralWrite from "./no-adhoc-structural-write";

export default {
  name: "page-editor",
  rules: {
    "no-adhoc-forest-write": noAdhocForestWrite,
    "no-adhoc-structural-write": noAdhocStructuralWrite,
  },
  ignores: {
    // The one module allowed to mutate `page_blocks`. Every export there takes a
    // `PageForestTx`, so the write is provably under its page's lock.
    "no-adhoc-forest-write": [
      "plugins/page/plugins/editor/server/internal/forest-writer.ts",
    ],
    // The two modules allowed to call the structural endpoints: the page's own
    // optimistic instance, and the composite router that fans writes out to it
    // (and owns the two lane-enqueued writes that carry no overlay).
    "no-adhoc-structural-write": [
      "plugins/page/plugins/editor/web/block-store.ts",
      "plugins/page/plugins/editor/web/composite-block-store.tsx",
    ],
  },
};
