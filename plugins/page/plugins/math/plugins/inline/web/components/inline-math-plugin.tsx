import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { createPortal } from "react-dom";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { $createInlineMathNode } from "./inline-math-node";

const TRIGGER = "$$";

/**
 * Inline, Notion-style `$$` math typeahead. Mirrors the editor's `[[` page-link
 * menu: open-state + query are derived from the live editor text (focus never
 * leaves the editor); Enter commits, Esc dismisses. Unlike page-link there is no
 * option list — math is freeform LaTeX, so the popover shows a single live preview
 * of the query and an "↵ to insert" hint.
 *
 * On commit, the `$$<query>` is replaced with an inline math node (+ a trailing
 * space). The node persists as a `\(<latex>\)` token via the block-text
 * extension's serializer.
 */
export function InlineMathPlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState<{ left: number; top: number } | null>(null);

  // Esc-dismissal latch: stays closed until the `$$` trigger is removed.
  const dismissedRef = useRef(false);

  const openRef = useLatestRef(open);
  const queryRef = useLatestRef(query);

  function close() {
    setOpen(false);
    setQuery("");
    setCaret(null);
  }

  // Derive open-state + query + caret position from the editor on every update.
  useEffect(() => {
    function sync() {
      lexicalEditor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) {
          close();
          return;
        }
        const node = sel.anchor.getNode();
        if (!$isTextNode(node)) {
          close();
          return;
        }
        const upToCaret = node.getTextContent().slice(0, sel.anchor.offset);
        const idx = upToCaret.lastIndexOf(TRIGGER);
        if (idx === -1) {
          dismissedRef.current = false;
          close();
          return;
        }
        // Guard: a `$$` at absolute offset 0 of the block's first line (no
        // preceding text) is the block-equation markdown shortcut — defer to it.
        // start-of-line `$$` = block equation; mid-line `$$` = inline math.
        if (idx === 0 && node.getPreviousSibling() === null) {
          dismissedRef.current = false;
          close();
          return;
        }
        const q = upToCaret.slice(idx + TRIGGER.length);
        // A `$` or newline inside the query ends/closes the trigger.
        if (/[$\n]/.test(q)) {
          dismissedRef.current = false;
          close();
          return;
        }
        setQuery(q);
        setOpen(!dismissedRef.current);
        const domRect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
        if (domRect) setCaret({ left: domRect.left, top: domRect.bottom });
      });
    }
    sync();
    return lexicalEditor.registerUpdateListener(sync);
  }, [lexicalEditor]);

  function commit() {
    const value = queryRef.current;
    if (value === "") return; // empty query → no-op
    lexicalEditor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf(TRIGGER);
      if (idx === -1) return;
      const head = full.slice(0, idx);
      const tail = full.slice(caretOffset);
      node.setTextContent(head);
      const math = $createInlineMathNode(value);
      const space = $createTextNode(" ");
      node.insertAfter(math);
      math.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
    close();
  }
  const commitRef = useLatestRef(commit);

  // Keyboard: registered ABOVE KeyboardPlugin (CRITICAL > HIGH) so Enter commits
  // when the popover is open, but falls through (return false) when closed.
  useEffect(() => {
    const unregisterEnter = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!openRef.current) return false;
        if (queryRef.current === "") return false;
        event?.preventDefault();
        commitRef.current();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterEscape = lexicalEditor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (!openRef.current) return false;
        dismissedRef.current = true;
        setOpen(false);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const unregisterBlur = lexicalEditor.registerCommand(
      BLUR_COMMAND,
      () => {
        setOpen(false);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      unregisterEnter();
      unregisterEscape();
      unregisterBlur();
    };
  }, [lexicalEditor, openRef, queryRef, commitRef]);

  if (!open || !caret) return null;

  return createPortal(
    <Surface
      level="overlay"
      // eslint-disable-next-line layout/no-adhoc-layout -- floating menu positioned via JS-computed caret coords
      className="z-popover fixed w-72 p-sm"
      style={{ left: caret.left, top: caret.top + 4 }}
    >
      <Stack gap="sm">
        <Center className="min-h-6">
          {query === "" ? (
            <Text variant="caption" tone="muted">
              Type a LaTeX expression…
            </Text>
          ) : (
            <KatexMath expression={query} display={false} />
          )}
        </Center>
        <Text variant="caption" tone="muted">
          ↵ to insert
        </Text>
      </Stack>
    </Surface>,
    document.body,
  );
}
