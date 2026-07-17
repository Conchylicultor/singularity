# Block selection is silently destroyed by a Lexical focus steal

**Date:** 2026-07-17
**Area:** `plugins/page/plugins/editor`
**Status:** fixed

## Symptom

Enter block-selection mode shortly after clicking into a block (click → Escape →
Shift+ArrowDown, back-to-back, on a freshly-opened page):

- `t=0`: correct — `document.activeElement` is the selection container, two blocks
  selected.
- `t≈200-300ms`, **with no further user input**: focus has moved back into a block's
  `contenteditable` and stays there. `useBlockSelection`'s `onFocusCapture` sees a
  non-container focus while `isActive` and calls `clearSelection()` — the user's
  selection is silently gone.

Consequence: a subsequent Cmd+V is no longer handled by the block-selection container
(its `document.activeElement !== containerRef.current` guard bails) and falls through
to the per-block Lexical caret paste (`block-forest-paste-plugin.tsx`), which anchors
on the caret's own block — so the paste lands in the wrong place. Any structural key
(Backspace / Tab / Cmd+D) aimed at the selection is simply lost.

Measured on the unfixed build: **11/12 runs** lost the selection. Inserting ~200ms of
settle between the click and Escape avoids it, which is why it read as flakiness.

## Root cause

Two independent facts compose into the bug.

**1. Moving focus to the container does not move the DOM selection.** `focusContainer()`
focused the container but left the text caret parked in the text node of the block the
user had just left.

**2. Lexical re-derives every commit's pending selection from the DOM selection.**
`$internalCreateSelection` reads the live DOM selection whenever the update has no
originating event (`eventType === undefined`) — true for any async/microtask-scheduled
commit. Reconciling a selection whose DOM position is unchanged while
`document.activeElement` is outside the editor root reads to Lexical as *"the caret
didn't move, so my root should have focus"*, and `$updateDOMSelection` calls
`rootElement.focus({preventScroll:true})` (`Lexical.dev.mjs:8113`).

Lexical guards exactly this for its own remote-collab updates
(`Lexical.dev.mjs:8060`):

```js
if (tags.has(COLLABORATION_TAG) && activeElement !== rootElement || …) return;
```

**The guard is bypassed because the offending commit carries no tag at all.**
`@lexical/yjs`'s `syncYjsChangesToLexical` does its content sync inside a
`COLLABORATION_TAG`-tagged update, but its `onUpdate` callback then fires a *second,
separate, untagged* `editor.update(() => $ensureEditorNotEmpty())`
(`LexicalYjs.dev.mjs:2509-2515`) — deliberately outside the tagged block, per the
library's own comment. That commit reaches `$updateDOMSelection` unguarded.

Verified empirically rather than by inspection: patching the built Lexical asset to
dump the tag set at the `focus()` call site reports `[]` on every steal — no
`collaboration`, no `historic`.

The trigger is any Yjs update landing on the just-blurred block's content doc. On a
fresh navigation the content-doc hydration echo is still in flight, and because
`CollaborationPlugin` mounts with `shouldBootstrap={false}` the root is genuinely
empty until it lands — so `$ensureEditorNotEmpty` is *not* a no-op: it appends a
paragraph, dirties the editor, and forces the untagged commit through.

## Why the caret, not the model selection, is the fuel

The natural reading is "the blurred block's Lexical *model* selection is still there
for the reconcile to restore." That is not the load-bearing half. Clearing only the
**DOM** selection — touching no model state — takes the steal from 11/12 to **0/12**.

This is why clearing the model selection alone would *not* have worked: with the model
selection nulled but the caret still in the block, Lexical rebuilds a `RangeSelection`
from the DOM, and because `currentSelection` is now null, `!pendingSelection.is(current)`
marks it dirty, it commits, and it steals anyway.

## Fix

`focusContainer()` now relinquishes the caret (`releaseCaret`, in
`web/internal/use-block-selection.ts`): when block-selection mode takes the keyboard,
the DOM selection inside the container is dropped. With no caret in the block, a
reconcile has nothing to restore and no reason to reclaim focus.

This holds against **any** async refocus, not just this trigger — which matters,
because the offending commit is issued *inside* `@lexical/yjs` with no update-options
seam to tag it from outside. (Contrast the app's own split-truncation, which tags
itself with `SKIP_DOM_SELECTION_TAG` in `collab-text-surgery.ts` precisely because it
*is* the app's own `editor.update()`.)

Only a selection inside the container is cleared — a selection elsewhere on the page is
not ours to drop.

### Fallout: the selection bar's Copy button

The bar's Copy button ran `container.focus()` + `document.execCommand("copy")`. That
worked **only by accident of the stale caret**, on two counts:

- `execCommand("copy")` emits a `copy` event only when the document has a selection to
  copy. With the caret relinquished there is none.
- `<SelectionBar>` renders *outside* the container (a React sibling, not a descendant),
  so a copy provoked from its button targets the button and never reaches the
  container's delegated `onCopy`. It only ever worked because the caret put the event
  target inside a block — and hence inside the container.

`copySelectionViaButton` (`block-editor.tsx`) now makes both explicit: it catches the
event at the document and seats a throwaway range over the container just long enough
for `execCommand` to fire. `writeClipboard` preventDefaults and substitutes the
serialized forest, so the range's own text never reaches the clipboard; `execCommand`
dispatches `copy` synchronously, so neither the range nor the listener can leak.
Cmd+C / Cmd+X were never affected — they originate inside the container.

## Coverage

`e2e/block-selection-verify.mjs` gained check 6. The existing checks all asserted state
*immediately* after the keypress, where it is still correct — the damage lands a beat
later. That is why this shipped. The new check reproduces the real trigger (fresh
navigation, no settle) and asserts after a 1.2s settle.

Validated in both directions: it fails on the unfixed build (`0 selected`, container
not focused) and passes on the fixed one.

## Provenance

Pre-existing; not introduced by the 2026-07-16 paste-anchor change (that change only
surfaced it). The Lexical mechanism is upstream; what exposes it here is the per-block
CRDT pipeline (2026-07-07) combined with Escape-to-select only actually working since
the 2026-07-10 origin-guard fix.

## Follow-up

The untagged `$ensureEditorNotEmpty` commit is arguably an upstream bug — Lexical
guards the steal for collab updates, and `@lexical/yjs` then routes around its own
guard. Worth an upstream issue/PR to tag that follow-up with
`SKIP_SELECTION_FOCUS_TAG`. Not required for this fix: relinquishing the caret is
robust to any async refocus, tagged or not.
