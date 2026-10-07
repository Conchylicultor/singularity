import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "live/no-legacy-resource-spelling",
    paths: [
      "core/resources.ts",
      "server/internal/resources.ts",
      "web/components/page-options.tsx",
    ],
    kind: "debt",
    task: "task-1791372067670-epcpji",
    reason:
      "Burndown: imported an old live-resource spelling when phase 3 started and still depends on the tree resource (item 3). New code declares, serves and reads through network/live; delete this entry when the file migrates.",
  },
  {
    rule: "page-editor/no-adhoc-block-id",
    paths: ["core/block-id.ts"],
    kind: "sanctioned",
    reason:
      "The one module allowed to mint a block id. Everything else — client ops, server handlers, the forest mint — calls its `newBlockId()`.",
  },
  {
    rule: "page-editor/no-adhoc-forest-write",
    paths: ["server/internal/forest-writer.ts"],
    kind: "sanctioned",
    reason:
      "The one module allowed to mutate `page_blocks`. Every export there takes a `PageForestTx`, so the write is provably under its page's lock.",
  },
  {
    rule: "page-editor/no-adhoc-doc-write",
    paths: [
      "web/__tests__",
      "web/internal/block-text-write.ts",
      "web/internal/live-state-yjs-provider.ts",
      "web/internal/local-yjs-provider.ts",
    ],
    kind: "sanctioned",
    reason:
      "The three origins of a block owner's canonical doc, and only them: the replay host, the two transport providers, the binding relay. Tests may stand in for a binding (a local transaction driven straight onto an owner's doc is how a suite types without mounting Lexical).",
  },
  {
    rule: "page-editor/no-unfiltered-blocks-read",
    paths: [
      "server/internal/forest-writer.ts",
      "server/internal/handle-patch-blocks.ts",
      "server/internal/live-blocks.ts",
      "server/internal/page-forest.ts",
      "server/internal/trash-blocks.ts",
    ],
    kind: "sanctioned",
    reason:
      "The modules that must see TRASHED rows: the delete/restore/purge chokepoint, its flag writers, the cascade-set walk (raw SQL), the page-id recompute (raw SQL) and doc-order CTE, the scope resolver (a lock name, never a row), the patch handler's \"which creates land on a trashed row\" lookup, the rank-park floor (a trashed sibling still holds its rank), the pasted-sub-page resolver, and the live relation's own definition.",
  },
  {
    rule: "page-editor/no-unfiltered-blocks-read",
    paths: ["server/internal/page-clipboard.ts"],
    kind: "sanctioned",
    reason:
      "A pasted sub-page: a cut page is in the trash when its paste claims it, and a copy of a since-deleted page still clones what it held.",
  },
  {
    rule: "page-editor/no-adhoc-structural-write",
    paths: ["web/block-store.ts", "web/composite-block-store.tsx"],
    kind: "sanctioned",
    reason:
      "The two modules allowed to call the structural endpoints: the page's own optimistic instance, and the composite router that fans writes out to it (and owns the two lane-enqueued writes that carry no overlay).",
  },
  {
    rule: "page-editor/no-unhistoried-block-field",
    paths: ["web/components/block-text-area.tsx"],
    kind: "sanctioned",
    reason:
      "The one module allowed to render a raw block textarea: it IS the sanctioned surface, and it records every typing run onto the document stack itself. Everything else in `plugins/page/**/web` takes one of the two answers the rule's message names.",
  },
  {
    rule: "sortable-list/no-raw-dnd-kit",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The page editor's block drag: droppable gaps between blocks plus a `DragOverlay` preview — not a sortable list.",
  },
] satisfies Exemptions;
