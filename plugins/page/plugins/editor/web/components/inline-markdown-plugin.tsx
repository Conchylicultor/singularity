import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  $getSelection,
  $isRangeSelection,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  PASTE_TAG,
} from "lexical";
import { useBlockEditor } from "../block-editor-context";
import {
  $scanInlineFormat,
  applyInlineFormat,
  INLINE_FORMAT_TAG,
  type InlineFormatPlan,
} from "../internal/inline-format-surgery";

/**
 * Inline markdown autoformat: typing the closing delimiter of `**bold**`,
 * `*italic*`, `***both***`, `~~strike~~` or `` `code` `` strips both delimiters
 * and applies the marks to what was between them.
 *
 * The inline sibling of `MarkdownShortcutPlugin` (block PREFIXES), and mounted
 * right after it. The two never interact except through `INLINE_FORMAT_TAG`: this
 * transform can *create* a prefix (`~~- foo~~` strikes to leave `- foo`), which
 * the block plugin must not read as the user typing a bullet marker.
 *
 * Because only `BlockTextEditor` mounts this, inline autoformat is absent from
 * code blocks BY CONSTRUCTION — `page/code-block` renders its own textarea over a
 * shiki underlay rather than a Lexical editor, so there is no opt-out flag to
 * keep in sync.
 *
 * The delimiter decision is `matchInlineFormat` (`core/inline-markdown.ts`,
 * unit-tested with no editor bootstrap); the mutation is `applyInlineFormat`
 * (`internal/inline-format-surgery.ts`). This component is only the *guard set*
 * that decides when to ask, plus the undo boundary.
 *
 * ## The undo requirement, and why `queueMicrotask` is mandatory
 *
 * Ctrl+Z immediately after an autoformat must revert only the FORMATTING,
 * restoring the literal `**xxx**` — a user who wanted real asterisks keeps them.
 * That needs the transform to land in its own `Y.UndoManager` item rather than
 * merging into the 500 ms-coalesced typing run that produced it, which is
 * exactly what `recordDocEdit` (→ `captureBlockDocEdit`) fences.
 *
 * That fence only holds if the transform's Yjs transaction lands INSIDE the
 * capture window, and an update listener runs with `editor._updating === true`:
 * an `editor.update()` issued from inside one is *enqueued* and only begins at
 * `$triggerEnqueuedUpdates` — after `captureBlockDocEdit` has already closed its
 * window and cleared `suppressUndoCapture`, silently losing the boundary AND
 * double-recording the edit through the mirror. In the microtask `_updating` is
 * false, so `discrete: true` commits synchronously and the binding's transaction
 * lands where it belongs. `editor/CLAUDE.md` records the same hazard for split
 * ("defers its capture one microtask because it runs from a Lexical command
 * handler"). `applyInlineFormat` throws rather than degrade if this is ever
 * violated.
 */
export function InlineMarkdownPlugin({ blockId }: { blockId: string }) {
  const [editor] = useLexicalComposerContext();
  const { recordDocEdit } = useBlockEditor();
  const recordDocEditRef = useLatestRef(recordDocEdit);

  useEffect(() => {
    // Latch: the microtask below both mutates the editor and (via the collab
    // binding) provokes further updates, so a listener invocation while one
    // transform is in flight must not schedule a second. Mirrors the block-level
    // plugin's `pending`.
    let pending = false;

    return editor.registerUpdateListener(
      ({ tags, dirtyLeaves, editorState, prevEditorState }) => {
        if (pending) return;
        // A text change is not by itself evidence of TYPING. An undo, a remote
        // peer's merge, or a paste can all leave text that ends in a delimiter,
        // and autoformatting there would apply a mark on nobody's keystroke.
        // `HISTORIC_TAG` in particular is what guarantees the transform cannot
        // re-fire on the Ctrl+Z that reverted it — by tag, not by heuristics.
        if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG) || tags.has(PASTE_TAG)) {
          return;
        }
        if (tags.has(INLINE_FORMAT_TAG)) return; // our own transform
        // Mid-IME the composed text is not yet committed; formatting it would
        // tear the composition. A non-editable editor takes no input at all.
        if (editor.isComposing() || !editor.isEditable()) return;

        // Previous caret, reduced to primitives: comparing it against the new one
        // needs no node reads, so the two editor states are never active at once.
        const prev = prevEditorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
          return { key: selection.anchor.key, offset: selection.anchor.offset };
        });
        if (prev === null) return;

        const plan = editorState.read((): InlineFormatPlan | null => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
          const anchor = selection.anchor;
          if (anchor.type !== "text") return null;
          // The caret's own leaf must be among the leaves this update dirtied —
          // i.e. the text under the caret is what changed, not some other node.
          if (!dirtyLeaves.has(anchor.key)) return null;

          // EXACTLY ONE CHARACTER WAS TYPED: the caret advanced by one within
          // its node, or the typed char opened a fresh `TextNode` (which happens
          // right after a decorator token, or in a previously empty block) and
          // therefore sits at offset 1.
          //
          // Deliberately STRICTER than `@lexical/markdown`'s own predicate,
          // which also admits a *decreasing* offset and therefore fires on
          // BACKSPACE: in Lexical's plugin, deleting the `y` from `**x**y`
          // auto-bolds. Ours must not — the user is dismantling that text, not
          // completing a delimiter. Do not "simplify" this into an
          // offset-changed test. It also subsumes the collapsed-and-CHANGED
          // check: both arms below imply the caret moved.
          const typedOneChar =
            anchor.key === prev.key ? anchor.offset === prev.offset + 1 : anchor.offset === 1;
          if (!typedOneChar) return null;

          return $scanInlineFormat();
        });
        if (plan === null) return;

        pending = true;
        queueMicrotask(() => {
          pending = false;
          // `applyInlineFormat` re-verifies the plan against live state and
          // returns false if anything drifted in this microtask — a legitimate
          // typed outcome, not a swallowed error. Nothing changed in that case,
          // so `recordDocEdit` puts nothing on the undo stack.
          recordDocEditRef.current(blockId, "Format text", () => {
            applyInlineFormat(editor, plan);
          });
        });
      },
    );
  }, [editor, blockId, recordDocEditRef]);

  return null;
}
