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
- **Text edits are per-block `Y.UndoManager` items mirrored onto the stack.**
  Text history lives in each block's content doc: the content-doc seam's
  manager coalesces a typing run into ONE item, and `recordTextEdit` (in
  `block-editor-context.tsx`) mirrors each new item 1:1 as a shared-stack
  entry whose thunks call that entry's `um.undo()`/`um.redo()` (see the
  per-block CRDT section below). There is no `data.text` text-autosave path —
  rows only receive text through the debounced doc→`data.text` projection.
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
  through the same optimistic pipeline. `projectText`, `BlockEditorAPI.update`,
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
  ignores `record` during replay. Bound editors never re-read `data.text` from a
  patch — content flows exclusively through the block's `Y.Doc`.
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
  `bulkDelete`, and all `dispatchOp` ops are recorded with exact,
  purely-computed after-states; text edits are recorded as mirrored
  `Y.UndoManager` items.

## Per-block CRDT text (unconditional)

Per-block CRDT text is THE text pipeline
(`research/2026-07-07-page-per-block-crdt-plan-b.md`, Stages 0–5 complete —
the `crdtText` flag and the legacy `ValueSyncPlugin` + `useEditableField`
autosave path are deleted). Every `BlockTextEditor` binds to a **per-block
`Y.Doc`** through `@lexical/react`'s `CollaborationPlugin`
(`components/collab-text-plugin.tsx`, `id = block.id`,
`shouldBootstrap={false}`, `editorState: null`). Remote/echoed changes apply
as a Yjs **merge**, never a serialized-string rebuild — the historical
fast-typing cursor-jump/scramble bug is structurally impossible. Per Plan B,
**structure stays relational forever**: `page_blocks` rows remain the
authoritative tree, and the structural op/patch pipeline is unchanged.
Existing pages need no migration: a block whose content doc doesn't exist yet
lazy-seeds it from `data.text` on first mount (the first-writer-wins doc-init
path below).

The transport seam is `internal/use-collab-block-doc.ts` — the ONLY place the
editor knows how content docs sync. It ref-counts one `{ doc, provider }` per
block id (strict-mode double mounts and second readers share one doc; deferred
destroy on last release) and wires `internal/live-state-yjs-provider.ts`:
**in** = the `blockContentResource` keyed live subscription (`applyUpdate`
with provider origin — the echo guard), **out** = first-writer-wins
`doc-init` seeding (live doc hydrated ONLY from the server's authoritative
response — closes the duplicate-seed hazard) + debounced (~300 ms) `doc-update`
posts of merged local updates. A future delta-WS transport swaps in behind
`useCollabBlockDoc` and nothing else changes.

**Projection + content-doc-aware split/merge:**

- **`doc → data.text` projection.** `CollabTextPlugin`'s `useTextProjection`
  observes the block's `Y.Doc` (`doc.on("update")` via `useCollabBlockDoc`'s
  `onContentChange` — local + server-applied changes, push-based), debounces
  ~1 s, serializes the bound editor's runs (byte-identical to `xmlTextToRuns`
  on the doc — same walk, no headless replica), and writes changed runs
  through `projectText` (`commitRow` with `record: false` — Yjs owns text
  history, so the write never lands on the undo stack) into the shared
  optimistic patch pipeline (`POST /blocks/patch` + `blocksChanged` fan-out).
  Never echoes into the editor (`data.text` is only read once, as the doc-init
  seed); skip-if-unchanged bounds churn; flushes on unmount (never from a
  never-synced editor). Rows therefore trail the doc by ≤1 s — search /
  backlinks / history stay fresh.
- **Split (Enter)** keeps the row pipeline verbatim (reducer leaves the head
  in the origin row, seeds the new block's row with the tail — its content doc
  initializes from that on mount) and additionally truncates the ORIGIN
  block's live editor from the caret (`BlockFocusHandle.truncateAt` →
  `internal/collab-text-surgery.ts`), driven THROUGH LEXICAL so the collab
  binding syncs the deletion into the content doc with marks/tokens intact.
  The projection is existence-gated against the RENDER-FRESH optimistic rows
  (`liveRowsRef`), not `rowsRef`: a deleted block's unmount flush fires before
  the effect that refreshes `rowsRef`, and an ungated flush would upsert
  (resurrect) the just-deleted row.
- **Merge (Backspace-at-start)** appends the merging block's LIVE runs onto
  the target's bound editor (`BlockFocusHandle.appendRunsAtEnd` — Lexical
  `$appendRuns` + caret at the live join offset), then the structural merge
  deletes the block (its `page_block_docs` row FK-cascades). If the target's
  editor is NOT mounted (virtualized offscreen), a lossless doc-level fallback
  (`appendRunsToBlockDoc`: `doc-init` → headless `editYDocState` append →
  incremental `doc-update`) runs FIRST and the structural delete only fires
  after it lands — a failed append leaves both blocks intact.
- A `doc-update` 409 after having been synced means the doc row vanished —
  usually FK-cascade-deleted (merge/delete) while a flush was in flight. The
  provider never guesses: it re-arms its init path and lets a doc-init probe
  arbitrate. 404 (block genuinely deleted) is a quiet terminal stop — the
  buffered bytes are deliberately dropped, their content already moved with
  the merge. Success (block ALIVE, row unexpectedly gone) recovers loudly:
  the row is re-created from the FULL local doc state (never the `data.text`
  seed, which would duplicate content the doc already holds) and the flush
  loop resumes — a 409 can never silently stop a live block from saving.

**CRDT text on the ONE unified undo stack:**

- **Per-block `Y.UndoManager`, owned by the seam.** Each registry entry in
  `use-collab-block-doc.ts` creates one manager over the doc's content root.
  Tracked origins are learned dynamically on `beforeTransaction`: anything
  that isn't the provider (server-applied state) and isn't an `UndoManager`
  (replays) is a local editing source — in practice exactly the
  `@lexical/yjs` binding, which is private to `CollaborationPlugin` and
  otherwise unreachable. Remote/echoed applies therefore never enter a
  block's text history. `CollaborationPlugin`'s own forced manager stays
  inert: its UNDO/REDO commands are swallowed at CRITICAL priority in
  `CollabTextPlugin` (the native keydown still bubbles to the window-level
  shortcut → the document stack).
- **Typing runs mirror 1:1 onto the shared stack.** The manager's
  `captureTimeout` (500 ms, matching the app's coalescing intent) folds a
  typing run into ONE stack item; each NEW item fires `onUndoableEdit`, which
  `recordTextEdit` records as one entry whose thunks call that entry's
  `um.undo()`/`um.redo()`. Deliberately NO `coalesceKey`: grouping already
  happened in the manager, and shared-stack coalescing would merge two
  entries over two manager items and break the 1:1 LIFO correspondence
  (`um.undo()` pops exactly one item). The correspondence argument: entries
  referencing one block's manager are recorded in item order, and the shared
  stack is LIFO — when an entry is popped, all later entries for that block
  were popped first, so the manager's top item IS the entry's item.
  Thunks are generation-guarded (registry-entry identity): if the block's doc
  was destroyed (block deleted, editor released) they no-op rather than
  popping a recreated manager's unrelated items.
- **Split/merge are ONE combined stack entry** (`recordStructuralWithDocEdit`):
  the structural patch pair AND the content-doc edit reverse/re-apply
  together, so rows and docs can never disagree after a single Cmd+Z.
  `captureBlockDocEdit` is the explicit capture boundary: `stopCapturing` on
  both sides + a suppress flag so the folded edit never double-records via
  the mirror. The surgery updates (`truncateBlockTextFrom`,
  `appendRunsAtJoin`) pass `discrete: true` so the binding's Yjs transaction
  lands synchronously inside the capture window — and `split` defers its
  capture one microtask because it is called from a Lexical command handler
  (inside the editor's own update; a nested update is queued past the
  window). Merge additionally pins the restored source row's `data.text` to
  the LIVE merging runs (`undoTextOverride`): the source doc was FK-cascaded
  with the row, so undo re-seeds it from that row — which must be exactly
  what was un-appended from the target, not a projection-lagged snapshot.
  The unmounted-target merge records doc-level thunks instead
  (`truncateBlockDocFrom` at the returned join offset / re-append).
- **Known degradations (consistent no-ops, never divergence):** redoing a
  text entry for a block whose creation was itself undone (doc destroyed +
  recreated → generation guard skips); undoing text in a block whose editor
  unmounted (collapsed ancestor) — the manager died with the doc. Both leave
  docs ≡ rows. Also: a typing run within 500 ms after a non-doc structural op
  on the same block merges into the pre-op manager item (coarse grouping,
  still consistent).
- The stuck-inverse-overlay hazard this exposed (undo patch → redo patch
  before the undo's confirming push arrives → the undo op could never
  confirm and replayed forever) is fixed in the `optimistic-mutation`
  primitive itself — SAME-TARGET cascade confirmation in `confirmPass` (see
  that plugin's CLAUDE.md). The editor declares op identity via
  `sameOverlayTarget` (block-id-set intersection), so the inverse pair
  cascades while an unrelated block's confirmation can never drop another
  block's still-pending op (e.g. a `projectText` projection patch).

**Hardening (validated: offline/reconnect, multi-tab, agent concurrency,
history restore):**

- **Doc-init FK gate.** A freshly created / split block mounts its editor from
  the optimistic overlay BEFORE the structural op's POST creates its `_blocks`
  row — a doc-init fired then would FK-violate (500) and the provider's
  `initStarted` latch would wedge the block editable-but-never-synced.
  Seeding is now gated on the block id appearing in **authoritative** blocks
  data: `useOptimisticResource` exposes `serverData` (the raw overlay base),
  the context derives `serverIds` from it, and `CollabTextPlugin` passes
  `rowConfirmed` into `useCollabBlockDoc`, which unlatches the provider
  (`markBlockRowConfirmed`, one-way) — push-based: the same blocks push that
  commits the row lifts the gate. Local edits made in the gap buffer in the
  doc and flush right after the seed. The latch can no longer wedge: any
  `initDoc` failure re-arms `initStarted` (a doc-init 404 — block deleted;
  the server maps the FK violation to a clean 404 — is a deliberate quiet
  TERMINAL stop: the provider latches `blockGone`, drops its buffered bytes,
  and becomes finalizable for the deferred destroy).
- **Instant deterministic pre-seed (synchronous hydration).** The gate
  alone left a freshly-minted block's editor EMPTY until confirm-push +
  doc-init — typing/Enter in that window merged badly with the later seed
  (duplicated paragraphs, keystrokes eaten by the origin truncation). Fixed
  structurally: seeds are DETERMINISTIC — `runsToXmlText` accepts a fixed
  Yjs `clientID`, derived by content-hashing the runs JSON (FNV-1a in
  `use-collab-block-doc.ts`) — so identical runs yield byte-identical seed
  encodings. For an UNCONFIRMED block (no row ⇒ no stored doc can exist, by
  FK) the provider pre-applies the seed locally at `connect()`: the editor
  hydrates synchronously, and the eventual authoritative state
  (its own doc-init echo, or a racing tab's byte-identical seed) merges as a
  no-op. Different runs get different clientIDs, so a mismatched seed can
  only duplicate (plain CRDT merge), never corrupt by item-id collision. The
  seed bytes are built ONCE per provider and reused for pre-apply + every
  doc-init attempt (a retry must never post different bytes than what was
  pre-applied). The pre-seed DISCRIMINATOR is the provider's
  construction-time `blockRowConfirmed` (the consumer's render-time
  `rowConfirmed`, threaded through `acquireCollabDoc`) — an existing block is
  confirmed from its very first render, so it can never pre-seed over its
  stored doc (which would merge the `data.text`-derived encoding into the
  stored one as DUPLICATED text on reopen), regardless of how
  `CollaborationPlugin` orders `connect()` relative to the hook's effects.
  Residual known edge: a keystroke landing < ~20ms after Enter
  (beyond human input; see `e2e/split-typing-window-probe.mjs`) can still be
  dropped.
- **Split focus/caret under pre-seed.** Two follow-on fixes: the origin's
  deferred truncation is background surgery on the block the user is LEAVING
  — it now carries `SKIP_DOM_SELECTION_TAG` so reconciling its cut-point
  selection can't yank DOM focus back from the new block; and
  `focusHydratingAware`'s non-empty path focuses with
  `defaultSelection: "rootStart"` (a pre-seeded fresh editor has no prior
  selection, and Lexical's default is rootEnd — wrong for a split).
- **Offline / reconnect.** Network-level seed/flush failures (fetch rejects,
  no HTTP status) are an expected local-first state: bytes stay queued
  (`pendingUpdates` re-queued at the head) and are retried push-based — on
  the live-state worktree socket's reopen (ws-status bus subscription in the
  provider), on the browser's `online` event (an idle WS may not surface a
  close promptly), on the next server push (`onServerState`), or on the next
  local edit. Never a retry timer. Unexpected HTTP errors still throw loudly.
  TEARDOWN is loss-safe too: the registry's deferred destroy only finalizes
  when the provider is `readyForTeardown` (queue drained, or block
  server-confirmed gone) — an ordinary unmount coinciding with a transient
  outage RETAINS the entry (the provider's reconnect listeners stay live),
  drains the queue on the next reconnect edge, then finalizes push-based via
  the provider's teardown-ready signal. Known edge: closing the TAB while
  offline can lose the last unflushed edits (nothing to retry from) — the
  same class as an unflushed autosave.
- **Update-only projection (restore/delete race).** The `data.text`
  projection dispatches `updateOnly` patches (`BlockPatch.updateOnly`): an
  upsert whose row no longer exists is skipped on BOTH the client overlay and
  the server writer, and `isPatchReflected` treats it as vacuously absorbed
  so the op confirms instead of sticking. This closes the interleave where a
  debounced projection flush races a history restore (or another tab's
  delete) and would otherwise blind-upsert (resurrect) the deleted row with
  pre-delete text.
- **History restore.** `replacePageContent` mints fresh block ids, so a
  restore is automatically doc-consistent: the wipe FK-cascades
  every old `page_block_docs` row, old editors unmount on the push (pending
  doc flushes 409 → the doc-init probe 404s → quiet terminal drop;
  projections are update-only), and the restored rows
  seed fresh content docs from the restored `data.text` on mount. See the
  invariant note on `replacePageContent` before ever preserving ids there.
- **Dormant positional-truncation hazard (offscreen-merge undo).** The
  offscreen-target merge's undo thunk (`truncateBlockDocFrom`) truncates the
  target doc POSITIONALLY — from the join offset to the doc end. Under a FUTURE
  virtualized + multi-writer target (my-devices + agents editing one block), a
  concurrent append past that offset lands in the truncated span and would be
  lost. Dormant today: the page editor doesn't virtualize, so the offscreen
  path never runs against a live second writer, and single-client LIFO undo
  holds. A correct fix is CRDT-relative (delete-set over the appended items, not
  an offset range) and is deferred until virtualization actually exists.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Block-based document editor component and slot system. Block-based document editor — tables, routes, and live state.
- Web:
  - Slots: `Editor.Block` ← `page.audio`, `page.bookmark`, `page.bulleted-list`, `page.callout`, `page.code-block`, `page.divider`, `page.embed`, `page.file`, `page.heading.heading-1`, `page.heading.heading-2`, `page.heading.heading-3`, `page.image`, `page.math.equation`, `page.numbered-list`, `page.page-link`, `page.quote`, `page.text`, `page.to-do`, `page.toggle`, `page.video`, `Editor.TurnInto` ← `page.turn-into-page`, `Editor.FormatAction` ← `page.formatting.bold`, `page.formatting.code`, `page.formatting.color`, `page.formatting.italic`, `page.formatting.link`, `page.formatting.strikethrough`, `page.formatting.underline`
  - Uses: `infra/endpoints.EndpointError`, `infra/endpoints.fetchEndpoint`, `infra/endpoints.useEndpointMutation`, `primitives/css/badge.Badge`, `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/overlay.Overlay`, `primitives/css/pin.Pin`, `primitives/css/row.Row`, `primitives/css/spacing.Stack`, `primitives/css/surface.Surface`, `primitives/css/text.Text`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/ui-kit.ControlSizeProvider`, `primitives/css/viewport-overlay.ViewportOverlay`, `primitives/floating-surface.FloatingSurface`, `primitives/icon-button.IconButton`, `primitives/icon-picker.SvgIcon`, `primitives/latest-ref.useEventCallback`, `primitives/latest-ref.useLatestRef`, `primitives/live-state.liveStateSocketKind`, `primitives/live-state.useResource`, `primitives/loading.Loading`, `primitives/multi-select.MultiSelectProvider`, `primitives/multi-select.SelectionBar`, `primitives/multi-select.useMultiSelect`, `primitives/multi-select.useMultiSelectItem`, `primitives/networking.subscribeWsStatus`, `primitives/optimistic-mutation.OpNoLongerApplies`, `primitives/optimistic-mutation.useOptimisticResource`, `primitives/popover.InlinePopover`, `primitives/popover.InlinePopoverProps`, `primitives/search.SearchInput`, `primitives/select-scope.ContentScope`, `primitives/slot-render.defineDispatchSlot`, `primitives/slot-render.defineRenderSlot`, `primitives/slot-render.DispatchContribution`, `primitives/undo-redo.UndoRedoProvider`, `primitives/undo-redo.useUndoRedo`, `primitives/undo-redo.useUndoRedoShortcuts`
  - Exports: Types: `BlockContribution`, `BlockEditorAPI`, `BlockEditorHandle`, `BlockPasteHandler`, `BlockRendererProps`, `BlockTextExtension`, `BlockTextPluginProps`, `FormatToolbarValue`, `MarkButtonProps`, `PageIconProps`, `PageOption`, `PageOptionsResult`; Values: `BLOCK_GUTTER`, `BlockEditor`, `BlockTextEditor`, `BlockTextRenderer`, `BlockTypeList`, `BlockTypeMenu`, `caretAnchor`, `colorCssValue`, `Editor`, `filterBlockTypes`, `getBlockTextExtensions`, `isValidLinkUrl`, `MarkButton`, `normalizeLinkUrl`, `OPEN_LINK_POPOVER_COMMAND`, `PageIcon`, `PageOptionsList`, `registerBlockPasteHandler`, `registerBlockTextExtension`, `useBlockEditor`, `useFormatToolbar`, `useInsertableBlocks`, `usePageOptions`
- Server:
  - Uses: `database.db`, `infra/endpoints.HttpError`, `infra/endpoints.implement`, `infra/events.defineTriggerEvent`, `primitives/rank.nextRankUnder`
  - DB schema: `plugins/page/plugins/editor/server/internal/tables-events.ts`, `plugins/page/plugins/editor/server/internal/tables.ts`
  - Exports: Types: `Block`, `BlockDeleteHook`, `BlocksChangedPayload`, `PageContentSnapshot`, `PageData`, `StoredBlock`; Values: `_blocks`, `BlockLifecycle`, `blocksChanged`, `BlockSchema`, `blocksLiveResource`, `PAGE_BLOCK_TYPE`, `pageData`, `PageDataSchema`, `pagesLiveResource`, `replacePageContent`, `serializePageContent`
  - Register: `defineTriggerEvent('page.blocksChanged')`
  - Routes: `GET /api/pages`, `GET /api/pages/:pageId/blocks`, `POST /api/blocks`, `PATCH /api/blocks/:id`, `DELETE /api/blocks/:id`, `POST /api/blocks/:id/move`, `POST /api/pages/:pageId/blocks/op`, `POST /api/pages/:pageId/blocks/patch`, `POST /api/pages/:pageId/blocks/bulk-delete`, `POST /api/pages/:pageId/blocks/bulk-move`, `POST /api/pages/:pageId/blocks/bulk-duplicate`, `POST /api/pages/:pageId/blocks/paste`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`, `primitives/collab-doc.readYDoc`, `primitives/collab-doc.yDocContent`, `primitives/collab-doc.yDocFromLexical`, `primitives/live-state.resourceDescriptor`, `primitives/rank.Rank`, `primitives/rank.RankSchema`, `primitives/tree.isDescendant`, `primitives/tree.subtreeIds`
  - Exports: Types: `Block`, `BlockDiff`, `BlockHandle`, `BlockNode`, `BlockOp`, `BlockPatch`, `BlockTextVariant`, `BulkDeleteBlocksBody`, `BulkDuplicateBlocksBody`, `BulkMoveBlocksBody`, `ColorToken`, `CreateBlockBody`, `Mark`, `MoveBlockBody`, `PageCover`, `PageData`, `PasteBlocksBody`, `RichText`, `RunsTokenExtension`, `RunsXmlTextOptions`, `SerializedBlock`, `TextData`, `TextRun`, `UpdateBlockBody`; Values: `applyBlockOp`, `applyBlockOpEndpoint`, `BlockOpSchema`, `BlockPatchSchema`, `BlockSchema`, `blocksResource`, `bulkDeleteBlocks`, `BulkDeleteBlocksBodySchema`, `bulkDuplicateBlocks`, `BulkDuplicateBlocksBodySchema`, `bulkMoveBlocks`, `BulkMoveBlocksBodySchema`, `childrenOf`, `coalesce`, `COLOR_TOKENS`, `colorCssValue`, `createBlock`, `CreateBlockBodySchema`, `defineBlock`, `deleteBlock`, `diffBlocks`, `isEmptyPatch`, `listBlocks`, `listPages`, `MARK_ORDER`, `mergeRuns`, `moveBlock`, `MoveBlockBodySchema`, `PAGE_BLOCK_TYPE`, `PageCoverSchema`, `pageData`, `PageDataSchema`, `pagesResource`, `pasteBlocks`, `PasteBlocksBodySchema`, `patchBlocks`, `patchesFromDiff`, `plainOf`, `prevVisibleLeaf`, `RichTextSchema`, `runsLength`, `runsOf`, `runsOfNode`, `runsToLexical`, `runsToXmlText`, `serializeBlockRuns`, `SerializedBlockSchema`, `sortMarks`, `splitRuns`, `SvgNodeSchema`, `textBlockSchema`, `textDataSchema`, `textOf`, `TextRunSchema`, `tokenOf`, `updateBlock`, `UpdateBlockBodySchema`, `withRuns`, `xmlTextToRuns`
- Cross-plugin:
  - Imported by: `apps/pages/content-search`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/welcome/recent-pages`, `apps/story/marker`, `apps/story/shell`, `apps/website/blog/publish`, `page/attachment-block`, `page/audio`, `page/bookmark`, `page/bulleted-list`, `page/callout`, `page/code-block`, `page/divider`, `page/editor-collab`, `page/embed`, `page/file`, `page/formatting/bold`, `page/formatting/code`, `page/formatting/color`, `page/formatting/italic`, `page/formatting/link`, `page/formatting/strikethrough`, `page/formatting/underline`, `page/heading/heading-1`, `page/heading/heading-2`, `page/heading/heading-3`, `page/image`, `page/inline-date`, `page/inline-page-link`, `page/links`, `page/math/equation`, `page/math/inline`, `page/numbered-list`, `page/page-link`, `page/quote`, `page/read-only-view`, `page/text`, `page/to-do`, `page/toggle`, `page/turn-into-page`, `page/url-paste`, `page/video`
  - Extended by: `apps/website/blog/publish` (table `page_blocks_ext_blog_post`), `apps/pages/starred` (table `page_blocks_ext_starred`), `apps/story/marker` (table `page_blocks_ext_story`)
  - Endpoint callers: `editor-collab`

<!-- AUTOGENERATED:END -->
