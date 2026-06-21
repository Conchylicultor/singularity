# editor

## Undo / redo (one unified stack)

Undo/redo is wired through the generic
`@plugins/primitives/plugins/undo-redo/web` primitive. `<BlockEditor>` mounts one
`<UndoRedoProvider>` per surface (so each tab has its own history), with
`BlockEditorProvider` inside it. There is a **single** document-level stack
covering BOTH text and structure — no per-block Lexical history.

- **One stack, surface-level router (focus-independent).** There is no Lexical
  `HistoryPlugin` (it was retired — a per-block parallel history is a layering
  error: the `page_blocks` row tree, not a Lexical document, is the source of
  truth). Cmd+Z / Cmd+Shift+Z / Cmd+Y are NOT routed per-block; `block-editor.tsx`
  mounts one `useUndoRedoShortcuts()` at the editor root, which registers
  tab-scoped (`surfaceId`-gated, `enableInInputs`) bindings on the window-level
  `ShortcutManager`. They fire whenever this tab is focused, regardless of which
  DOM element holds the caret — a block contenteditable, the selection container,
  or `<body>` after a structural undo deletes the focused block. Nothing in
  `keyboard-plugin.tsx` / `block-editor.tsx`'s container `onKeyDown` consumes those
  keys anymore, so the native keydown bubbles out untouched (no `HistoryPlugin`
  registers a Lexical `UNDO_COMMAND`). This replaces the old focus-dependent routing
  whose breakage — Cmd+Z reaching neither handler once focus fell to `<body>` —
  caused the original "redo does nothing" defect. Text and structure interleave in
  true chronological order.
- **Text edits are `data.text` patches.** `block-text-editor.tsx`'s debounced
  autosave calls `commitText(blockId, nextRuns, caretOffset)` (in
  `block-editor-context.tsx`) instead of the old `PATCH /api/blocks/:id`. It clones
  the row (replacing only `data.text`), diffs it, `record`s the patch pair with
  `coalesceKey: block.id` (so a typing run + the editable-field debounce collapse
  into one undo step), and dispatches the forward patch — so forward typing and
  undo/redo flow through the SAME optimistic-patch pipeline. Caret restoration is
  approximate (an offset clamp via the block's `focusOffset` handle), captured at
  save time with `$caretOffsetWithinParagraph()`.
- **Command-pattern patches, not snapshots.** Recording happens at the mutation
  chokepoints in `block-editor-context.tsx`: snapshot `before = rowsRef.current`,
  compute `after`, `diffBlocks(before, after)` (pure, `core/block-diff.ts`), derive
  minimal forward/reverse `BlockPatch`es (`{ upserts, deleteIds }`), and `record`
  thunks that re-apply them onto the CURRENT state. `recordPatchEntry` is the shared
  helper (threads an optional `coalesceKey`); `recordStructural` calls it with none
  (structural ops never coalesce). Entanglement-safe — undoing an old action never
  clobbers later unrelated edits.
- **One single-row chokepoint (`commitRow`).** Every *single-row* mutation funnels
  through one internal helper — `commitRow(blockId, transform, opts)`: snapshot rows,
  apply `transform` to just that row, diff into a minimal patch pair, optionally
  `record` it (skipped when `opts.record === false`), then dispatch the forward patch
  through the same optimistic pipeline. `commitText`, `BlockEditorAPI.update`,
  `convertTo`, and `setExpanded` are all thin callers of it, so forward apply and
  undo/redo are symmetric by construction and a new block type's `editor.update(...)`
  is recorded automatically. (Multi-row structural ops still go through `dispatchOp`/
  `move`/`bulkDelete` + `recordStructural`.)
- **Same optimistic instance.** A `patch` overlay variant flows through the SAME
  `useOptimisticResource` as forward ops (instant overlay + reconcile), POSTing to
  `POST /api/pages/:pageId/blocks/patch` (`handle-patch-blocks.ts` — a blind
  row-level upsert+delete writer sharing the op handler's delete-lifecycle and the
  `notifyStructuralChange` notify path). Undo/redo thunks dispatch patches DIRECTLY
  (never through the recording wrapper), and the primitive's re-entrancy guard
  ignores `record` during replay. `ValueSyncPlugin` re-syncs the live editor from
  the resource when a patch lands; its `selfWriteRef` echo-suppression keeps the
  re-sync from re-recording.
- **Non-text `data` edits ARE now recorded.** Every `BlockEditorAPI.update(data)`
  edit — to-do `checked`, callout color, image src, etc. — routes through the shared
  `commitRow` chokepoint (`coalesceKey: blockId`), so it is optimistic AND on the
  unified stack; `convertTo`'s forward apply now flows through the same patch pipeline
  as its undo/redo (no asymmetric `PATCH /api/blocks/:id` write). The editor no longer
  uses `updateBlock` at all (`handle-update-block.ts` stays for the page-level
  consumers: page title, sidebar expand, cover).
- **NOT recorded:** `setExpanded` only — pure view state, dispatched with
  `record: false` (Notion doesn't undo collapse/expand). It is still optimistic via
  the patch pipeline, just never pushed onto the stack.
- **Follow-up:** `bulkMove`, `bulkDuplicate`, and `paste` are NOT yet recorded —
  they mint server ids/ranks, so a clean inverse needs those endpoints to return
  their resulting rows (or to be diffed against the post-settle resource).
  `convertTo`, non-text `data` edits, single-block `move` (client-known rank),
  `bulkDelete`, text edits, and all `dispatchOp` ops are recorded with exact,
  purely-computed after-states.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Block-based document editor component and slot system. Block-based document editor — tables, routes, and live state.
- Web:
  - Slots: `Editor.Block` ← `page.audio`, `page.bookmark`, `page.bulleted-list`, `page.callout`, `page.code-block`, `page.divider`, `page.embed`, `page.file`, `page.heading.heading-1`, `page.heading.heading-2`, `page.heading.heading-3`, `page.image`, `page.math.equation`, `page.numbered-list`, `page.page-link`, `page.quote`, `page.text`, `page.to-do`, `page.toggle`, `page.video`, `Editor.TurnInto` ← `page.turn-into-page`, `Editor.FormatAction` ← `page.formatting.bold`, `page.formatting.code`, `page.formatting.color`, `page.formatting.italic`, `page.formatting.link`, `page.formatting.strikethrough`, `page.formatting.underline`
  - Uses: `infra/endpoints.fetchEndpoint`, `infra/endpoints.useEndpointMutation`, `primitives/css/badge.Badge`, `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/overlay.Overlay`, `primitives/css/pin.Pin`, `primitives/css/row.Row`, `primitives/css/spacing.Stack`, `primitives/css/surface.Surface`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/viewport-overlay.ViewportOverlay`, `primitives/editable-field.useEditableField`, `primitives/icon-button.IconButton`, `primitives/icon-picker.SvgIcon`, `primitives/live-state.useResource`, `primitives/loading.Loading`, `primitives/multi-select.MultiSelectProvider`, `primitives/multi-select.SelectionBar`, `primitives/multi-select.useMultiSelect`, `primitives/multi-select.useMultiSelectItem`, `primitives/optimistic-mutation.OpNoLongerApplies`, `primitives/optimistic-mutation.useOptimisticResource`, `primitives/popover.InlinePopover`, `primitives/popover.InlinePopoverProps`, `primitives/search.SearchInput`, `primitives/select-scope.ContentScope`, `primitives/slot-render.defineDispatchSlot`, `primitives/slot-render.defineRenderSlot`, `primitives/slot-render.DispatchContribution`, `primitives/undo-redo.UndoRedoProvider`, `primitives/undo-redo.useUndoRedo`, `primitives/undo-redo.useUndoRedoShortcuts`
  - Exports: Types: `BlockContribution`, `BlockEditorAPI`, `BlockPasteHandler`, `BlockRendererProps`, `BlockTextExtension`, `BlockTextPluginProps`, `FormatToolbarValue`, `MarkButtonProps`, `PageIconProps`, `PageOption`, `PageOptionsResult`; Values: `BLOCK_GUTTER`, `BlockEditor`, `BlockTextEditor`, `BlockTextRenderer`, `BlockTypeList`, `BlockTypeMenu`, `colorCssValue`, `Editor`, `filterBlockTypes`, `getBlockTextExtensions`, `isValidLinkUrl`, `MarkButton`, `normalizeLinkUrl`, `OPEN_LINK_POPOVER_COMMAND`, `PageIcon`, `PageOptionsList`, `registerBlockPasteHandler`, `registerBlockTextExtension`, `useBlockEditor`, `useFormatToolbar`, `useInsertableBlocks`, `usePageOptions`
- Server:
  - Uses: `database.db`, `infra/endpoints.HttpError`, `infra/endpoints.implement`, `infra/events.defineTriggerEvent`, `primitives/rank.nextRankUnder`
  - DB schema: `plugins/page/plugins/editor/server/internal/tables-events.ts`, `plugins/page/plugins/editor/server/internal/tables.ts`
  - Exports: Types: `Block`, `BlockDeleteHook`, `BlocksChangedPayload`, `PageContentSnapshot`, `PageData`, `StoredBlock`; Values: `_blocks`, `BlockLifecycle`, `blocksChanged`, `BlockSchema`, `blocksLiveResource`, `PAGE_BLOCK_TYPE`, `pageData`, `PageDataSchema`, `pagesLiveResource`, `replacePageContent`, `serializePageContent`
  - Register: `defineTriggerEvent('page.blocksChanged')`
  - Routes: `GET /api/pages`, `GET /api/pages/:pageId/blocks`, `POST /api/blocks`, `PATCH /api/blocks/:id`, `DELETE /api/blocks/:id`, `POST /api/blocks/:id/move`, `POST /api/pages/:pageId/blocks/op`, `POST /api/pages/:pageId/blocks/patch`, `POST /api/pages/:pageId/blocks/bulk-delete`, `POST /api/pages/:pageId/blocks/bulk-move`, `POST /api/pages/:pageId/blocks/bulk-duplicate`, `POST /api/pages/:pageId/blocks/paste`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`, `primitives/live-state.resourceDescriptor`, `primitives/rank.Rank`, `primitives/rank.RankSchema`, `primitives/tree.isDescendant`, `primitives/tree.subtreeIds`
  - Exports: Types: `Block`, `BlockDiff`, `BlockHandle`, `BlockNode`, `BlockOp`, `BlockPatch`, `BlockTextVariant`, `BulkDeleteBlocksBody`, `BulkDuplicateBlocksBody`, `BulkMoveBlocksBody`, `ColorToken`, `CreateBlockBody`, `Mark`, `MoveBlockBody`, `PageCover`, `PageData`, `PasteBlocksBody`, `RichText`, `SerializedBlock`, `TextData`, `TextRun`, `UpdateBlockBody`; Values: `applyBlockOp`, `applyBlockOpEndpoint`, `BlockOpSchema`, `BlockPatchSchema`, `BlockSchema`, `blocksResource`, `bulkDeleteBlocks`, `BulkDeleteBlocksBodySchema`, `bulkDuplicateBlocks`, `BulkDuplicateBlocksBodySchema`, `bulkMoveBlocks`, `BulkMoveBlocksBodySchema`, `childrenOf`, `coalesce`, `COLOR_TOKENS`, `createBlock`, `CreateBlockBodySchema`, `defineBlock`, `deleteBlock`, `diffBlocks`, `isEmptyPatch`, `listBlocks`, `listPages`, `MARK_ORDER`, `mergeRuns`, `moveBlock`, `MoveBlockBodySchema`, `PAGE_BLOCK_TYPE`, `PageCoverSchema`, `pageData`, `PageDataSchema`, `pagesResource`, `pasteBlocks`, `PasteBlocksBodySchema`, `patchBlocks`, `patchesFromDiff`, `plainOf`, `prevVisibleLeaf`, `RichTextSchema`, `runsLength`, `runsOf`, `runsOfNode`, `SerializedBlockSchema`, `sortMarks`, `splitRuns`, `SvgNodeSchema`, `textBlockSchema`, `textDataSchema`, `textOf`, `TextRunSchema`, `updateBlock`, `UpdateBlockBodySchema`, `withRuns`
- Cross-plugin:
  - Imported by: `apps/pages/content-search`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/welcome/recent-pages`, `apps/story/marker`, `apps/story/shell`, `page/attachment-block`, `page/audio`, `page/bookmark`, `page/bulleted-list`, `page/callout`, `page/code-block`, `page/divider`, `page/embed`, `page/file`, `page/formatting/bold`, `page/formatting/code`, `page/formatting/color`, `page/formatting/italic`, `page/formatting/link`, `page/formatting/strikethrough`, `page/formatting/underline`, `page/heading/heading-1`, `page/heading/heading-2`, `page/heading/heading-3`, `page/image`, `page/inline-date`, `page/inline-page-link`, `page/links`, `page/math/equation`, `page/math/inline`, `page/numbered-list`, `page/page-link`, `page/quote`, `page/read-only-view`, `page/text`, `page/to-do`, `page/toggle`, `page/turn-into-page`, `page/url-paste`, `page/video`
  - Extended by: `apps/pages/starred` (table `page_blocks_ext_starred`), `apps/story/marker` (table `page_blocks_ext_story`)

<!-- AUTOGENERATED:END -->
