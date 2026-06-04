import { useEffect, useMemo, useRef } from "react";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { Editor } from "../slots";

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
 * On a match it strips the prefix from the *live* editor and converts the block
 * type. Because every text-like block type shares one renderer, the conversion
 * reconciles in place: the same editor keeps focus, so any text the user keeps
 * typing flows straight into the now-bulleted block.
 */
export function MarkdownShortcutPlugin({
  block,
  editor,
}: {
  block: Block;
  editor: BlockEditorAPI;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const contributions = Editor.Block.useContributions();

  // Flatten every registered block's prefixes into {prefix, type} pairs, longest
  // prefix first so a more specific marker wins over a shorter one.
  const rules = useMemo(() => {
    const out: { prefix: string; type: string; empty?: () => unknown }[] = [];
    for (const c of contributions) {
      for (const prefix of c.block.markdownPrefixes ?? []) {
        out.push({ prefix, type: c.block.type, empty: c.block.empty });
      }
    }
    return out.sort((a, b) => b.prefix.length - a.prefix.length);
  }, [contributions]);

  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const blockTypeRef = useRef(block.type);
  blockTypeRef.current = block.type;

  useEffect(() => {
    // Seed with the current text so the initial DB-load update is treated as the
    // baseline rather than a user-typed transition.
    let prevText = lexicalEditor
      .getEditorState()
      .read(() => $getRoot().getTextContent());
    let pending = false;

    return lexicalEditor.registerUpdateListener(() => {
      lexicalEditor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        const before = prevText;
        prevText = text;
        if (pending || text === before) return;

        for (const { prefix, type, empty } of rulesRef.current) {
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
              const remaining = current.slice(prefix.length);
              lexicalEditor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                if (remaining.length > 0) {
                  paragraph.append($createTextNode(remaining));
                }
                root.append(paragraph);
                paragraph.selectEnd();
              });
              prevText = remaining;
              // Seed the target type's default payload (e.g. a to-do's
              // `checked`) before overlaying the preserved text.
              editorRef.current.convertTo(type, { ...(empty?.() ?? {}), text: remaining });
            });
            return;
          }
        }
      });
    });
  }, [lexicalEditor]);

  return null;
}
