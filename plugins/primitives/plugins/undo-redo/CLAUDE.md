# undo-redo

Surface-scoped, domain-agnostic client-side undo/redo command-history stack —
the **command-pattern** tier (record minimal forward/reverse thunks; undo applies
the reverse onto the *current* state), not snapshots. One independent history per
surface tab, backed by `scoped-store`.

The provider is mounted **once per tab**, by `apps-core/tab-surface` — not by any
app or editor. The history is a platform capability: a sidebar row's delete and an
edit in the page body land on ONE chronological stack, and the `mod+z` bindings are
registered exactly once per surface (two same-id registrations would race in the
page-global `ShortcutManager`). Consumers only `record`.

```tsx
import { useScopedUndoRedo, useUndoRedo } from "@plugins/primitives/plugins/undo-redo/web";

// Recording a reversible command into the tab's history:
const { record, undo, redo, canUndo, canRedo, clear } = useUndoRedo();
record({
  label: "Move block",
  undo: () => applyPatch(reverse),
  redo: () => applyPatch(forward),
  coalesceKey: "drag:block-7", // optional: merge rapid same-key edits
});

// Same api, but every entry dies with this mount (see "Entry lifetime" below):
const scoped = useScopedUndoRedo();
```

## Behavior

- **Command pattern.** Each `HistoryEntry` carries an `undo` and a `redo` thunk
  (sync or async). `undo()` pops `past`, runs `undo()`, pushes onto `future`;
  `redo()` is symmetric. Entanglement-safe: a thunk only touches what its action
  touched, so undoing an old action never clobbers later unrelated edits.
- **Coalescing.** When a new record shares the top entry's `coalesceKey` and
  arrives within `coalesceWindowMs` (default 500ms), the two merge into one —
  **keep the first entry's `undo`, take the latest entry's `redo` + label**. Used
  for run-together edits (typing, dragging) that should undo as a unit.
- **Re-entrancy guard.** While an `undo`/`redo` thunk runs, the store's
  `replaying` flag is raised, so the reverse/forward patch the thunk dispatches
  (which usually flows back through the same `record` path) is **ignored** rather
  than recorded as a brand-new command.
- **Fresh records clear `future`** and the `past` stack is capped to `maxDepth`
  (default 200) by dropping the oldest entries.
- **`canUndo` / `canRedo` are reactive** (selector reads) — components re-render
  when they flip. `record` / `undo` / `redo` / `clear` are stable callbacks.
- **Loud failures.** A rejected `undo`/`redo` thunk surfaces as an
  `UndoRedoThunkError` (the guard runs the thunk fire-and-forget; a rejection
  becomes an unhandled rejection, never silently swallowed).

## Entry lifetime (scopes)

The stack outlives every pane and editor in the tab, so an entry must be honest
about what it needs to replay:

> **An entry whose thunks depend on a live mount MUST declare a `scope`; a
> scope's entries are dropped from `past` AND `future` when that mount unmounts.
> Entries whose thunks are self-contained (pure server calls) stay unscoped and
> live for the tab.**

`useScopedUndoRedo()` is the whole mechanism: same `UndoRedoApi`, but `record`
stamps a `useId()`-derived scope onto every entry and the unmount cleanup calls
`dropScope(scope)`. Use it whenever the thunks close over a per-mount store, doc,
or editor (the page editor's optimistic overlay and per-block `Y.UndoManager`s die
with its mount — replaying one after would be a no-op at best, and a patch
dispatched into the wrong page's overlay at worst). Use plain `useUndoRedo()` when
`undo`/`redo` are just server calls valid anywhere in the tab (a trash restore),
so the entry rightly survives navigating away.

`dropScope` is a pure filter over both stacks (`internal/stack.ts`), so a scope's
removal never disturbs surrounding entries.

## Shortcuts

`useUndoRedoShortcuts({ when? })` registers three surface-scoped bindings via
`useSurfaceShortcuts`: `mod+z` (undo), `mod+shift+z` and `mod+y` (redo). All have
`enableInInputs: true` so they fire inside editable surfaces; undo is gated on
`canUndo && when?.(event)`, redo on `canRedo && when?.(event)`. **`tab-surface`
already calls it once per tab — a consumer never calls it again**, or two same-id
registrations race in the page-global `ShortcutManager`. A tab whose app records
nothing keeps an empty stack, so the `when` guard rejects and the keys are never
claimed.

### This stack is not the only undo history on screen (`resolveUndoOwner`)

> `mod+z` belongs to the innermost history declaring itself over the keystroke's
> target.

A tab also holds histories the stack doesn't own — every native
`<input>`/`<textarea>`, and every Lexical editor mounting `HistoryPlugin` (the
`text-editor` primitive: agent prompt, task description, draft form). All answer
to the same key. `resolveUndoOwner(event.target)` (`internal/undo-owner.ts`) is
the built-in first half of every binding's `when`, reading the nearest
ancestor-or-self `data-undo-owner`:

- `surfaceUndoProps` — a region whose edits are recorded on THIS stack, so a
  caret inside it must not withhold the key. The page block list is the case:
  no per-block Lexical history, so what the user types is recorded onto this
  stack instead — block text through `recordTextEdit`, a block's own plain-text
  field through `useBlockPlainText` / `<BlockTextArea>`.
- `localUndoProps` — a field whose ⌘Z must stay INSIDE it: a nested editor with
  a history of its own, or a transient field the browser's own undo stack should
  own. **A chrome field inside a `surfaceUndoProps` region has to spread it** —
  an empty bookmark block's URL prompt, a place search box, the URL input in the
  link popover. They hold nothing the page persists, so the browser is the right
  owner, and without the marker the region around them takes the key instead.
  `page-editor/no-unhistoried-block-field` is the rung that enforces it: a raw
  `<textarea>` / `<input>` / `contenteditable` under `plugins/page/**/web` is an
  error unless it renders `<BlockTextArea>` or spreads the marker.

**Undeclared resolves off the target**: a text-editing host is `local`, anything
else `surface`. That test is narrower than `shortcuts`' `isEditableTarget` on
purpose (which counts checkboxes and file pickers): no text history to protect,
and ⌘Z right after ticking a checkbox must still reach the stack.

**But the fallback only applies when NO ancestor declares** — resolution is by
nearest declaring ancestor, so the two cases read opposite ways, and the second
is where the marker stops being optional:

- **No declaring ancestor.** The undeclared field already resolves to `local`,
  so the marker changes nothing.
- **Inside a `surfaceUndoProps` region.** The region wins. An undeclared field
  there sends ⌘Z to the SURFACE stack: the binding calls `preventDefault()`, the
  browser's own history for that field never runs, and the last unrelated
  document edit is reversed while the user is typing. Every field rendered in
  the page body is in this case.

This section used to say the marker "fails safe — a missing one costs a
keystroke that stays in the field being typed in, never a document rewound
behind the user's back". That is true only in the first case, and false in the
second. Two authors read it and shipped the same bug: a page block rendering its
own `<textarea>` (the code block, then `math/equation`), where a paste could not
be undone and ⌘Z rewound the document instead.

A portal is not a substitute for declaring it either. A field a popover lifts to
`document.body` reads as `local` only because `closest()` no longer sees the
region, and `PortalForwardProvider` exists precisely to re-stamp
ancestry-derived `data-*` attributes across portals — so that reading is one
commit from flipping.

Two consequences that look like bugs and are not: focus on `<body>` (where a
structural undo leaves it) is `surface`, so undo chains; and ⌘Z in a page TITLE
undoes the title text only — an ordinary autosaved input, never on this stack.

## Invariants

- Pure stack/coalescing logic lives in `web/internal/stack.ts` (React-free,
  unit-tested in `stack.test.ts`); the store only wires it to `scoped-store` and
  runs the thunks. `Date.now()` is read only inside `record` (never during render).
- No contributions — a pure library primitive. Renders no visible UI.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Surface-scoped client-side undo/redo command-history stack: a UndoRedoProvider per surface tab holding past/future stacks of {undo,redo} thunks, with time-windowed coalescing, a max-depth cap, a re-entrancy guard so replayed patches aren't re-recorded, mount-scoped entries (useScopedUndoRedo drops its entries when its mount unmounts), and an optional useUndoRedoShortcuts (mod+z / mod+shift+z / mod+y) convenience binding.
- Web:
  - Uses:
    - `primitives/latest-ref.useLatestRef`
    - `primitives/scope/scoped-store.defineScopedStore`
    - `primitives/shortcuts.useSurfaceShortcuts`
  - Exports (types):
    - `HistoryEntry`
    - `UndoOwner`
    - `UndoRedoApi`
    - `UndoRedoProviderProps`
    - `UndoRedoShortcutsOptions`
  - Exports (values):
    - `localUndoProps`
    - `resolveUndoOwner`
    - `surfaceUndoProps`
    - `UNDO_OWNER_ATTR`
    - `UndoRedoProvider`
    - `useScopedUndoRedo`
    - `useUndoRedo`
    - `useUndoRedoShortcuts`
- Cross-plugin:
  - Imported by:
    - `apps-core/tab-surface`
    - `apps/pages/page-tree`
    - `infra/trash`
    - `page/bookmark`
    - `page/editor`
    - `page/embed`
    - `page/formatting/link`
    - `page/math/inline`
    - `page/page-link`
    - `page/place`
    - `primitives/text-editor`

<!-- AUTOGENERATED:END -->
