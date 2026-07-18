# TextEditor: guard external `value` from clobbering a focused editor

**Date:** 2026-07-18
**Scope:** `plugins/primitives/plugins/text-editor/` (the `ValueSyncPlugin` inside
`web/components/text-editor-impl.tsx`)

> **REVERTED** — see
> [`2026-07-18-primitives-text-editor-guard-revert.md`](./2026-07-18-primitives-text-editor-guard-revert.md).
> The guard below duplicated the focus check `useEditableField` already performs for
> both server-backed consumers, while breaking clear-after-send in the conversation
> prompt bar (`clearDraft()` was parked on focus, then dropped on the next keystroke).
> Kept as the record of why it was tried. If the two holes it cites ever reproduce,
> fix them in `useEditableField`, not in the editor.

## The bug

`TextEditor` two-way-syncs a markdown `value` prop against a Lexical editor.
`ValueSyncPlugin` owns the *inbound* half: whenever the `value` prop differs from
the last content the editor serialized, it calls `applyMarkdownToEditor`, which
does `root.clear()` + a full rebuild of the document from the markdown string.

That rebuild throws away the editor's **selection, caret and scroll position**.
It is correct for a display-mode value swap or a frozen-field mirror — the editor
isn't focused, there is no caret to lose. It is *destructive* the instant it
fires while the user is typing: their cursor jumps to the end of a freshly-rebuilt
tree and their in-progress selection is gone.

Today the only thing preventing that is a guard that lives **outside** the editor,
in `plugins/primitives/plugins/editable-field/web/use-editable-field.ts`:
`useEditableField` refuses to mirror an incoming server `value` into its `draft`
while its `focusedRef` is true, so the `value` the editor sees never changes
mid-edit. That guard is insufficient as the *only* protection for three reasons:

1. **It is opt-in per consumer.** Every consumer must both route through
   `useEditableField` *and* correctly wire `onFocus`/`onBlur` into it (see
   `task-description`'s `DescriptionView`, which threads them through a wrapper
   `<div onFocus onBlur>`). A consumer that passes a live server `value` straight
   into `<TextEditor>` — or forgets a handler — has no protection at all.
2. **There is a mount→autofocus gap.** `useEditableField.focusedRef` starts
   `false` and only flips `true` when the DOM focus event reaches React's
   `onFocus`. `EditorShell` autofocuses the editor on mount (a sibling effect that
   runs *before* `ValueSyncPlugin`'s), so there is a window where the editor holds
   the real caret while `focusedRef` is still `false`. A server echo arriving in
   that window slips past the consumer-side guard.
3. **The invariant belongs to the editor.** "An external value must never clobber
   a focused editor" is a property of the editor primitive, not a discipline each
   of ~10 call sites re-implements. Leaving it outside is exactly the
   "you-must-also-update-X" coupling the repo's plugin-boundary philosophy exists
   to delete.

The fix moves the invariant *into* `ValueSyncPlugin`, so it holds for every
consumer with zero wiring, and the consumer-side `useEditableField` guard becomes
a redundant (harmless) first line of defense rather than the only one.

## The invariant

> A `value` prop change that would **replace** the document must never be applied
> while the editor is focused. It is parked and applied on blur — unless the
> user's own edits have since superseded it, in which case it is dropped.

## Focus-detection mechanism

We reuse the same event-driven signal the `caret-trigger` primitive already
relies on: Lexical dispatches `FOCUS_COMMAND` / `BLUR_COMMAND` off the root
element's DOM focus/blur events. `ValueSyncPlugin` keeps a `focusedRef` updated by
those two commands, initialized once from `root.contains(document.activeElement)`
to cover an editor autofocused before the effect ran.

This is preferred over reading `document.activeElement` live inside the value
effect because (a) it is the established precedent in this codebase, and (b) it is
driveable in a jsdom test via `editor.dispatchCommand(FOCUS_COMMAND, …)` without
depending on jsdom's brittle contenteditable focus semantics. The `BLUR_COMMAND`
handler is needed regardless — it is what applies a parked value — so folding the
`FOCUS_COMMAND` twin into the same effect costs nothing. Both handlers `return
false` (non-consuming), exactly like `caret-trigger`, so they never interfere with
the editor's own focus handling.

## Defer / drop semantics

`ValueSyncPlugin` gains one ref: `pendingExternalRef` — a `value` parked to apply
on blur. The three writers:

- **Value effect** (`value` prop changed):
  - `value === lastSerialized` → nothing to apply; clear any parked value (a
    server echo of the user's own edit has caught up, so the parked value is now
    stale). This is the "no longer differs → drop" case.
  - **replacement while focused** (`lastSerialized !== null` *and* `focusedRef`) →
    park `value` in `pendingExternalRef` and return without touching the document.
  - otherwise → clear the parked value and apply immediately (the pre-existing
    behavior for every non-focused apply: display swaps, frozen mirroring, the
    initial mount apply).
- **Update listener** (a genuine user edit, i.e. `md !== lastSerialized`) → clear
  `pendingExternalRef`. **The draft wins:** once the user has typed over the
  editor, a value parked earlier must never be applied on blur, because doing so
  would blow away the user's just-typed content back to the (stale) server
  version — the very clobber this guard exists to prevent. Selection-only changes
  (`md === lastSerialized`) early-return and leave the parked value intact.
- **Blur handler** → take and clear `pendingExternalRef`; apply it *only if it
  still differs* from `lastSerialized`. After a blur there is no caret to
  destroy, so the parked external update finally lands.

### Interplay with `useEditableField`'s flush-on-blur

The subtle case the invariant has to get right: `useEditableField.onBlur` calls
`flush()`, saving the current `draft` to the server, *at the same time* the editor
blurs. If a stale external value were parked and blindly applied on blur, it would
overwrite the draft the user just flushed. The two rules above make the draft win
deterministically:

- If the user typed after the value was parked, the **update listener already
  dropped it** — blur applies nothing, and `flush()` saves the user's draft. ✔
- If the user did *not* type after it was parked, then `draft === lastSerialized`
  (no edit happened), `flush()` is a no-op save of already-saved content, and blur
  legitimately applies the newer external value. ✔

There is no ordering hazard between `flush()` and the blur apply because the two
never both do work: at most one of "the user edited" (⇒ drop, flush saves) and
"the user didn't" (⇒ apply, flush no-ops) is true.

## The initial-apply carve-out

The guard must not block the **first** application of `value` into a just-mounted,
empty editor. `EditorShell`'s autofocus effect is a sibling rendered *before*
`ValueSyncPlugin`, so on mount the editor can already hold focus when the value
effect first runs — and deferring the first apply would leave the editor blank
until the user blurs.

The carve-out is the `lastSerialized !== null` test in the "replacement while
focused" branch. `lastSerialized` is `null` until the first apply sets it, so the
first apply is by definition **not** a replacement and runs regardless of focus.
Every subsequent apply is a replacement and is subject to the defer/drop logic.
No focus-timing assumption is needed — the null sentinel *is* "have we ever put
content in this editor," which is exactly the right question.

## What is deliberately unchanged

- The `TextEditor` prop contract is untouched — the change is entirely internal to
  `ValueSyncPlugin` plus one small `editorHasFocus` helper.
- Every non-focused apply behaves byte-for-byte as before (display-mode swaps,
  frozen-field mirroring, disabled read-only value changes): no caret ⇒ no defer.
- `useEditableField`'s existing focus/frozen guard stays. It now just means the
  editor's own guard rarely has to fire for those consumers — defense in depth,
  not redundancy to remove.

## Tests

`web/__tests__/value-sync.test.tsx` (vitest/jsdom) drives the real
`ValueSyncPlugin` under a real `LexicalComposer` (mirroring
`caret-trigger/web/__tests__/wedge.test.tsx`), asserting on the editor's
serialized content:

- a `value` change while focused is **deferred**, then applied on blur;
- a `value` change while **not** focused applies immediately;
- the **initial** apply lands even when the editor is already focused;
- a user edit after a value is parked **drops** the parked value (draft wins);
- a `value` that catches up to the edited content clears the parked value.
