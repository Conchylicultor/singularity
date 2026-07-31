import { useEffect, useMemo } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { $getRoot, COLLABORATION_TAG, HISTORIC_TAG } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Block, RowData } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";
import { INLINE_FORMAT_TAG } from "../internal/inline-format-tag";

/**
 * Markdown block-shortcut affordance. Each block type declares its own
 * `markdownPrefixes` (e.g. a bulleted list owns `["* ", "- ", "+ "]`); this
 * plugin reads them generically from the dispatch slot — it never names a
 * specific block type, so adding a heading/quote/to-do type needs zero changes
 * here.
 *
 * It fires only on the *transition* into a prefixed state (the previous text did
 * not start with the prefix, the new text does). That makes it trigger the
 * instant the user types the trailing space, while never auto-converting
 * DB-seeded content like a literal `* foo` on mount.
 *
 * On a match it strips the prefix and converts the block type through the ONE
 * `convertStrippingText` primitive — the strip is a CONTENT-DOC edit (a block's
 * text has a single owner; the row's `data.text` is a projection of it), never a
 * row payload the type write carries. Ordering it that way is what makes the
 * strip survive at all: a target type that swaps the block's dispatch component
 * unmounts this editor, so a row write claiming to carry the stripped text can
 * never actually strip anything.
 *
 * Because most text-like block types share one renderer, the conversion
 * reconciles IN PLACE: the same Lexical instance keeps focus, so text the user
 * keeps typing flows straight into the now-bulleted block. (`quote` and
 * `prompt` still own their own dispatch component, so converting into those two
 * remounts the editor — the strip lands first regardless, which is the point of
 * the ordering above.)
 *
 * **A transition only counts when the USER produced it.** The listener is tag-
 * guarded because a text transition is not by itself evidence of typing:
 *
 * - `HISTORIC_TAG` / `COLLABORATION_TAG` — a Ctrl+Z or a remote peer's merge can
 *   land text that *begins* with a prefix, and converting there would change the
 *   block type on nobody's keystroke. Pre-existing hazard, since this plugin
 *   originally filtered no tags at all.
 * - `INLINE_FORMAT_TAG` — the inline-markdown autoformat strips delimiters, so it
 *   can itself *create* a prefix: `~~- foo~~` strikes to leave `- foo`, whose
 *   transition would silently become a bullet.
 *
 * A guarded update still has to **advance `prevText`** — the baseline is what
 * "transition" is measured against, so returning early without updating it would
 * make the next genuine keystroke diff against stale text and fire a phantom
 * transition.
 */
export function MarkdownShortcutPlugin({ block }: { block: Block }) {
  const [lexicalEditor] = useLexicalComposerContext();
  const contributions = Editor.Block.useContributions();
  const { convertStrippingText } = useBlockEditor();

  // Flatten every registered block's prefixes into {prefix, type} pairs, longest
  // prefix first so a more specific marker wins over a shorter one.
  const rules = useMemo(() => {
    const out: {
      prefix: string;
      type: string;
      emptyRowData: () => RowData;
      collapsible?: "always";
    }[] = [];
    for (const c of contributions) {
      for (const prefix of c.block.markdownPrefixes ?? []) {
        out.push({
          prefix,
          type: c.block.type,
          emptyRowData: () => c.block.emptyRowData(),
          collapsible: c.block.collapsible,
        });
      }
    }
    return out.sort((a, b) => b.prefix.length - a.prefix.length);
  }, [contributions]);

  const rulesRef = useLatestRef(rules);
  const convertRef = useLatestRef(convertStrippingText);
  const blockIdRef = useLatestRef(block.id);
  const blockTypeRef = useLatestRef(block.type);

  useEffect(() => {
    // Seed with the current text so the initial DB-load update is treated as the
    // baseline rather than a user-typed transition.
    let prevText = lexicalEditor
      .getEditorState()
      .read(() => $getRoot().getTextContent());
    let pending = false;

    return lexicalEditor.registerUpdateListener(({ tags }) => {
      lexicalEditor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        const before = prevText;
        // Advance the baseline BEFORE any early return, guarded updates
        // included: whatever text an undo / a remote merge / our own inline
        // transform left behind IS the state the next keystroke transitions
        // from (see the component comment).
        prevText = text;
        if (
          tags.has(HISTORIC_TAG) ||
          tags.has(COLLABORATION_TAG) ||
          tags.has(INLINE_FORMAT_TAG)
        ) {
          return;
        }
        if (pending || text === before) return;

        for (const { prefix, type, emptyRowData, collapsible } of rulesRef.current) {
          if (type === blockTypeRef.current) continue;
          // Only on the transition into the prefixed state.
          if (text.startsWith(prefix) && !before.startsWith(prefix)) {
            pending = true;
            // Defer: an update listener may not mutate during the same update.
            // Recompute the remainder at flush time so any keystrokes typed in
            // the gap are preserved.
            queueMicrotask(() => {
              pending = false;
              const current = lexicalEditor
                .getEditorState()
                .read(() => $getRoot().getTextContent());
              if (!current.startsWith(prefix)) return;
              // Keep the update listener's baseline in step with the strip we
              // are about to make, so it doesn't read the removal as a new
              // transition.
              prevText = current.slice(prefix.length);
              // The prefix is the leading run of the FIRST paragraph, so its
              // node offsets are its linear offsets. Stripping it through the
              // surgery seam (rather than rebuilding the root from plain text,
              // as this did before) preserves marks and inline tokens in the
              // text that follows, and leaves the caret at the block's start
              // instead of teleporting it to the end.
              //
              // Seeds only the target type's NON-text defaults (e.g. a to-do's
              // `checked`): the block keeps its id, hence its content doc, hence
              // its text. An "always" collapsible target (a toggle) opens.
              convertRef.current({
                blockId: blockIdRef.current,
                from: 0,
                to: prefix.length,
                type,
                data: emptyRowData(),
                expanded: collapsible === "always" ? true : undefined,
              });
            });
            return;
          }
        }
      });
    });
  }, [lexicalEditor]);

  return null;
}
