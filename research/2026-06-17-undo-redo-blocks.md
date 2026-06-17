# Undo / Redo for the block editor (Ctrl+Z / Ctrl+Shift+Z)

## Goal

Professional, Notion-grade undo/redo for the block-based page editor. Built as a
**standalone, domain-agnostic primitive** (`plugins/primitives/plugins/undo-redo/`)
plus thin wiring inside the page editor.

## Standard approaches (and what we picked)

There are three classic ways apps implement undo:

1. **State snapshots / memento** — snapshot the whole document before each change;
   undo restores the snapshot. Simple, but *entangles independent edits*: undoing
   an old structural change also wipes unrelated text typed afterwards, and stores
   O(doc) per step. Rejected.
2. **Immutable state history** — keep a list of past whole-states. Same entanglement
   + memory problem at document granularity. Good only for tiny state.
3. **Command pattern with inverse steps** — record each user action as a pair of
   *minimal* forward/reverse patches; undo applies the reverse patch onto the
   *current* state. This is what ProseMirror / Slate / Notion do. Entanglement-safe
   (a patch only touches the rows the action touched) and cheap. **Chosen.**

### Two-tier model (why)

Each block's rich text is a Lexical editor with its own `HistoryPlugin`. We keep
that for **intra-block text** undo (word-level coalescing, well-tested). Our new
primitive owns the **document/structural** tier: block create/delete/split/merge/
indent/outdent/move, bulk ops, paste, and type-conversion.

Cmd+Z routing (handled inside the editor's existing Lexical keyboard plugin, at
`COMMAND_PRIORITY_HIGH`, plus the block-selection keydown handler):

- Focus inside a block's text **and** Lexical `canUndo` → Lexical undoes text (consume).
- Otherwise (Lexical history empty, or block-selection mode, or non-text focus) →
  structural undo from our stack.

This mirrors how block editors compose a per-leaf text history with a document
history, while preserving the polished in-block typing experience.

## The generic primitive: `plugins/primitives/plugins/undo-redo/`

Pure library plugin (no framework slots). Backed by `scoped-store` so each surface
instance (each editor tab) has its own independent history.

```ts
// web/index.ts barrel
export { UndoRedoProvider, useUndoRedo, useUndoRedoShortcuts };
export type { HistoryEntry, UndoRedoApi };

interface HistoryEntry {
  label?: string;                       // for tooltips / menu ("Undo move block")
  undo: () => void | Promise<void>;     // apply the reverse patch (+ restore focus)
  redo: () => void | Promise<void>;     // re-apply the forward patch (+ restore focus)
  coalesceKey?: string;                 // adjacent entries with same key + within
  coalesceWindowMs?: number;            // window merge into one (keep first.undo, last.redo)
}

interface UndoRedoApi {
  record(entry: HistoryEntry): void;    // push to past, clear future (with coalescing)
  undo(): void;                         // pop past -> run undo -> push to future
  redo(): void;                         // pop future -> run redo -> push to past
  canUndo: boolean;
  canRedo: boolean;
  clear(): void;
}
```

- `<UndoRedoProvider>` wraps the editor surface; holds `{ past: HistoryEntry[]; future: HistoryEntry[] }`
  in a `defineScopedStore`. Cap stack depth (e.g. 200) to bound memory.
- `useUndoRedo()` reads the api (reactive `canUndo`/`canRedo` via selectors).
- `useUndoRedoShortcuts({ when? })` — optional convenience for *non-Lexical*
  consumers: binds `mod+z` (undo) and `mod+shift+z` + `mod+y` (redo) via
  `useSurfaceShortcuts`, guarded by `when`. The page editor does NOT use this; it
  routes through its own Lexical keyboard plugin to implement the two-tier delegation.
- While `undo()`/`redo()` is running, set a re-entrancy flag so the reverse/forward
  patches those thunks dispatch do **not** themselves get recorded as new history.

## Page-editor wiring

### Minimal forward/reverse patches

A patch is `{ upserts: BlockRow[]; deleteIds: string[] }` (block rows, including
`data`, `rank`, `parentId`, `pageId`, `type`, `expanded`). Computed on the client
from the pure reducers we already have:

- For a structural `BlockOp`: `before = rowsRef.current`, `after = applyBlockOp(before, op)`.
  Diff before/after (reuse the existing `reconcileBlocks` logic, which lives in
  `core/`) → forward diff `D`.
  - **redo patch** = upsert `D.inserted ∪ D.updated`, delete `D.deletedIds`.
  - **undo patch** = upsert the *prior* rows of `D.updated ∪ D.deleted`, delete `D.insertedIds`.
- For `move`, `convertTo`, `setExpanded`, `bulk*`, `paste`: same shape — capture the
  affected rows' before-state and the resulting after-state, diff, store both patches.

Because patches are scoped to exactly the rows the action touched, undoing an old
action never clobbers unrelated later edits (entanglement-safe).

### Applying a patch (optimistic, through existing infra)

Add a `patch` variant to the optimistic overlay op union
(`web/internal/optimistic-block-ops.ts`): its `apply(blocks)` upserts/deletes on the
client `Block[]`, its `mutate` POSTs to a new transactional endpoint
`POST /api/pages/:pageId/blocks/patch` that upserts rows + deletes ids in one
transaction, fixes nothing else, runs `BlockLifecycle.BeforeDelete` for removed
blocks, and calls `notifyBlockChange`. This flows through the **same
`useOptimisticResource` instance** as normal ops → instant overlay + server
confirmation, no flicker.

> The forward user action keeps using its existing specific endpoint/op (semantics
> unchanged). Only undo/redo use the generic patch path.

### Recording

Wrap the mutation surface in `block-editor-context.tsx`:

- `dispatchOp(op)` → compute before/after via `applyBlockOp`, diff, `record({...})`
  with a structural label, then dispatch as today. Focus restoration: capture the
  caret/active block id before, restore it in the undo/redo thunks.
- `move`, `convertTo`, `setExpanded`, `bulkDelete`, `bulkMove`, `bulkDuplicate`,
  `paste` → same pattern (capture affected before-rows, compute after, record).
- **Text autosave (`update` with only `data.text`)** is NOT recorded here — Lexical
  owns that tier. (Type conversion via `convertTo` IS recorded.)

### Keyboard

- `keyboard-plugin.tsx` (inside each block's Lexical editor): intercept Cmd+Z /
  Cmd+Shift+Z / Cmd+Y at `COMMAND_PRIORITY_HIGH`. If Lexical `canUndo`/`canRedo`,
  let Lexical handle (return true). Else call `editor`'s structural undo/redo and
  return true.
- Block-selection-mode keydown (`block-editor.tsx`): Cmd+Z / Cmd+Shift+Z → structural
  undo/redo.
- A toolbar affordance (optional, nice-to-have): undo/redo icon buttons in the page
  header showing `canUndo`/`canRedo`, reusing the api.

## Reuse / boundaries

- Reuses: `scoped-store`, `shortcuts`, `surface-id`, `optimistic-mutation`,
  `reconcileBlocks` + `applyBlockOp` (already in page editor core).
- Touches only: the new primitive (additive) and the page editor plugin
  (`editor` sub-plugin). No load-bearing infra is modified.
- Other apps (data-view inline edit, etc.) can later adopt `undo-redo` via
  `useUndoRedoShortcuts`.

## Caveats / follow-ups

- Multi-client concurrency: patches are last-writer-wins like the rest of the editor;
  no OT/CRDT. Acceptable for current single-user usage.
- The two-tier boundary (per-block text history vs global structural history) can feel
  slightly different from a single unified stack; matches common block-editor behavior.
- A future unification (route text edits into the same stack, drop Lexical
  HistoryPlugin) is possible but riskier; deferred.
