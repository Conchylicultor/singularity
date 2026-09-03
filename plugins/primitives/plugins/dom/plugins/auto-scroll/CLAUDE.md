# auto-scroll

The **scroll-owning** primitive: the one sanctioned home for driving a scroll
container. `no-adhoc-scroll-write` (see
[`scroll-safety`](../../../../../framework/plugins/tooling/plugins/lint/plugins/scroll-safety/CLAUDE.md))
bans `scrollTop =` / `scrollTo()` / `scrollBy()` repo-wide except in this
plugin's own files, so a new scroll behavior belongs *here*, not in the consumer
that wants it. Today that is four roles:

- **stick-to-bottom streaming** — `useStickyScroll` + `JumpToBottomButton`
- **container-scoped positioning** — `scrollToBottom`, `scrollChildIntoView`
  (scroll only THIS container; never an ancestor, unlike `scrollIntoView`)
- **gesture edge auto-scroll** — `useEdgeAutoScroll`
- **scroll-container discovery** — `findScrollParent`

## `useStickyScroll` — following is an intent, never an inference

You follow until a scroll **the hook did not author** lands you elsewhere; you
follow again when such a scroll lands you back at the bottom. Content settling,
reflow and new messages only *carry out* that standing intent. Consumers render
the returned `bottomSentinel` as the scroll container's last child (asserted at
mount) and signal nothing — there is no content-length effect to remember.

**Do not reintroduce a size observer.**
[`research/2026-05-25-global-sticky-scroll-redesign.md`](../../../../../../research/2026-05-25-global-sticky-scroll-redesign.md)
removed one because a size delta is *sign-blind*: opening the file pane rewraps
text taller, which is indistinguishable from new content. Watching the sentinel
(`useInView`, from [`primitives/dom/in-view`](../in-view/CLAUDE.md)) is instead
*sign-asymmetric* — a taller reflow can only make the bottom **less** visible —
so it can exclusively un-follow, and a signal like that cannot drag anyone
downward. Asserted in
`internal/sticky-scroll-machine.test.ts`. The guarantee is narrower than it
sounds: while following, reflow *does* write. It is "no observation-driven writes
**while not following**".

**Intent = a scroll whose offset ≠ what we last wrote** (read back after writing,
so clamping counts). Do **not** swap in gesture listeners: they miss scrollbar
drags, find-in-page, `useEdgeAutoScroll`, and `revealElement` — which
`jsonl-pane`'s `StickyUserHeader` fires on expand, so a user at the bottom would
be yanked back and the expand undone on the same frame. **Every own write must be
instant, including `jumpToBottom`** — a smooth scroll's intermediate offsets never
match the recorded one, so the hook reads its own animation as the user leaving
and cancels the jump mid-flight. The one thing the comparison cannot serve is the
`scroll` handler itself (IO delivers async, so its cached answer describes the
pre-scroll position); that reads geometry via `isAtBottom`, which is safe because
only a position change fires `scroll`.

**`followKey` means "the user just acted"** — never ambient state. `isWorking`
also rises when a background agent resumes, which must not move a reading user.

**Sentinel geometry, both load-bearing** (the observer is `in-view`'s; the
geometry and the follow policy stay here): the pin `threshold` becomes bottom
`rootMargin` (a zero-height node at `threshold: 0` means a 0px pin distance), and
the root is widened hugely left/right so horizontal scroll on an `axis="both"`
surface can't carry the sentinel out of view.

**`persist: { key, anchorAttr }`** (opt-in): `key` must identify the *surface
instance* (compose `useSurfaceTabId()`) — two panes can show one conversation at
different positions. `anchorAttr`'s value must be content identity: use
`data-event-key`, never `data-event-index`, which indexes the *filtered* array and
re-points whenever an `EventFilter` resolves. A saved anchor whose row is gone
returns `missing`, distinct from `none`, so a key-scheme regression can't read as
"first visit".

## `useEdgeAutoScroll` — the gesture contract

While a gesture's pointer sits in the top or bottom edge band of its scroll
viewport, the surface scrolls, ramping up the closer to the edge. The hook knows
nothing about the gesture: the consumer feeds it a viewport `clientY` (`track`)
and ends it (`stop`, from pointerup **and** pointercancel). Vertical only,
deliberately — a speculative `axis` option would be an untested path.

**`onScroll` is the gesture's second clock, not a notification.** While the
pointer is parked at an edge it is the ONLY thing driving the consumer forward —
the pointer did not move, the *content* did — so a gesture re-evaluating only on
`pointermove` would scroll the document and select nothing new. Extract the
per-move body into one applier called from both places. Mirror rule: **`track` is
called from the pointer handler only, never from that applier**, or the hook
re-latches off its own callback. (It fires only on a frame that actually moved the
surface: at a clamped edge the consumer's per-frame work must not run for nothing.)

**The scroll parent is resolved per gesture** — lazily on the first `track` after
a `stop`, never at mount: the anchor may be unmounted when the hook first runs,
and a host may re-parent the surface between gestures.

**`requireOverflowing: true`** is what keeps failure loud. The plain walk returns
the first *style*-scrollable ancestor even when its content currently fits, and
the loop would then run at 60fps writing a `scrollTop` that never budges —
indistinguishable from "parked at the bottom". Callers that merely *read* a scroll
offset (windowing) want the opposite default, since the styled ancestor is right
even before enough rows arrive to overflow it. Hence an opt-in, not one behavior.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The scroll-owning primitive: the one sanctioned home for driving a scroll container. Stick-to-bottom streaming (useStickyScroll + JumpToBottomButton), container-scoped scrollToBottom / scrollChildIntoView, gesture-agnostic edge auto-scroll (useEdgeAutoScroll), and the shared findScrollParent discovery.
- Web:
  - Uses:
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/dom/in-view.useInView`
    - `primitives/latest-ref.useEventCallback`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/persistent-draft.clearDraft`
    - `primitives/persistent-draft.readDraft`
    - `primitives/persistent-draft.writeDraft`
  - Exports (types):
    - `EdgeAutoScroll`
    - `FindScrollParentOptions`
    - `JumpToBottomButtonProps`
    - `JumpToBottomView`
    - `ScrollAlign`
    - `ScrollChildIntoViewOptions`
    - `ScrollToBottomOptions`
    - `StickyScrollHandle`
    - `StickyScrollPersist`
    - `UseEdgeAutoScrollOptions`
    - `UseStickyScrollOptions`
  - Exports (values):
    - `findScrollParent`
    - `JumpToBottomButton`
    - `scrollChildIntoView`
    - `scrollToBottom`
    - `useEdgeAutoScroll`
    - `useStickyScroll`
- Cross-plugin:
  - Imported by:
    - `apps/sonata/rich/chord-progression`
    - `build`
    - `build/build-logs`
    - `conversations/conversation-view/jsonl-viewer`
    - `conversations/conversation-view/jsonl-viewer/outline`
    - `debug/logs`
    - `layouts/miller`
    - `page/editor`
    - `primitives/log-channels`
    - `primitives/outline/scroll-spy`
    - `primitives/virtual-rows`

<!-- AUTOGENERATED:END -->
