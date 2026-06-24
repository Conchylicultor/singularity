import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { createPortal } from "react-dom";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import type { BlockHandle } from "../../core";
import type { BlockEditorAPI } from "../types";
import {
  BlockTypeList,
  filterBlockTypes,
  useInsertableBlocks,
} from "./block-type-list";

const TRIGGER = "/";

/**
 * Inline, Notion-style slash menu. Open-state + query are derived from the live
 * editor text (focus never leaves the editor): typing `/` opens it, the text
 * after the `/` filters it, arrows/Enter navigate, Esc dismisses.
 *
 * The `/` triggers anywhere mid-line — not only at the start — so it works the
 * way Notion does. To avoid firing on `/` inside ordinary text (URLs like
 * `http://`, dates like `06/15`, paths like `a/b`, fractions like `1/2`), the
 * trigger only opens when the `/` sits at a word boundary: at the start of the
 * text node, or immediately after whitespace. A `/` followed by a space is a
 * literal slash and never opens the menu.
 *
 * Because the trigger is mid-line, the menu is portaled to `document.body` and
 * positioned at the caret rect (mirroring the `[[` page-mention menu) rather
 * than anchored to the block.
 *
 * On select, the `/query` is stripped and the block is converted in place to
 * the chosen type, keeping the text around the slash (Notion's model: `/`
 * transforms the current block).
 */
export function SlashMenuPlugin({ editor }: { editor: BlockEditorAPI }) {
  const [lexicalEditor] = useLexicalComposerContext();
  const insertable = useInsertableBlocks();

  // Open-state + query + caret position derived from the live editor text.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState<{ left: number; top: number } | null>(null);

  // The Esc-dismissal latch: once set, the menu stays closed until the `/`
  // trigger is removed from the text before the caret.
  const dismissedRef = useRef(false);

  // The last query reflected into state, so the update listener can reset the
  // active row exactly when the query changes (replacing a query-keyed effect).
  const lastQueryRef = useRef("");

  // The portaled menu element, so a click-outside test can exclude clicks that
  // land on the menu itself (row clicks go through onMouseDown+preventDefault).
  const menuRef = useRef<HTMLElement | null>(null);

  const filtered = filterBlockTypes(insertable, query);

  // The menu is only interactive when it has a position and at least one match;
  // otherwise keyboard nav must fall through (e.g. arrows/Enter while a no-match
  // query is showing nothing should navigate/split, not get swallowed).
  const visible = open && !!caret && filtered.length > 0;

  // Refs let the (stable) Lexical command callbacks read fresh state — the
  // closures capture stale values otherwise (mirrors keyboard-plugin's editorRef).
  const visibleRef = useLatestRef(visible);
  const filteredRef = useLatestRef(filtered);
  const activeIndexRef = useLatestRef(activeIndex);

  function close() {
    setOpen(false);
    setQuery("");
    setCaret(null);
  }

  // Track the text and recompute open-state + query + caret on every update.
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
          // Trigger gone → reset the Esc latch and close.
          dismissedRef.current = false;
          close();
          return;
        }
        // Only a `/` at a word boundary (start, or after whitespace) is a slash
        // command — this keeps URLs/dates/paths from opening the menu.
        const atWordBoundary = idx === 0 || /\s/.test(upToCaret[idx - 1]!);
        if (!atWordBoundary) {
          dismissedRef.current = false;
          close();
          return;
        }
        const q = upToCaret.slice(idx + TRIGGER.length);
        // A newline ends the query; any space in the query means the user typed
        // a literal `/ …` (not a command) — Notion dismisses the menu the moment
        // a space follows the slash. Either way reset the latch and close.
        if (/\n/.test(q) || q.includes(" ")) {
          dismissedRef.current = false;
          close();
          return;
        }
        // Reset the active row whenever the query changes, co-located with the
        // setQuery write (this is the editor update-listener callback, not
        // render) so the highlight starts at the top synchronously — no
        // render-behind flash and no separate query-keyed effect.
        if (lastQueryRef.current !== q) {
          lastQueryRef.current = q;
          setActiveIndex(0);
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

  // Dismiss on a genuine click anywhere outside the menu. The editor's own
  // BLUR_COMMAND only fires when focus actually leaves the contenteditable, so a
  // click on a non-focusable region (sidebar, padding, another block) wouldn't
  // close the menu. Latch dismissed so it stays closed until the `/` is removed.
  // Row clicks land on the menu element and are excluded.
  useEffect(() => {
    if (!visible) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      dismissedRef.current = true;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [visible]);

  function handleSelect(handle: BlockHandle<unknown>) {
    // Convert the current block to the chosen type, dropping the `/query`
    // (Notion's model: `/` transforms the current block, keeping the text around
    // the slash). `convertTo` authoritatively rewrites the block's `data` — the
    // same path the markdown shortcuts use — so the field's debounced autosave
    // can't clobber it.
    //
    // Compute `remaining` from a synchronous READ: this runs inside the Enter
    // command (already within a Lexical update), so a nested `lexicalEditor.
    // update()` is DEFERRED — its result isn't observable here. The strip below
    // is purely the live-editor reflection; `convertTo` is what persists.
    let found = false;
    let nodeKey = "";
    let stripIdx = 0;
    let caretIdx = 0;
    let remaining = "";
    lexicalEditor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf(TRIGGER);
      if (idx === -1) return;
      found = true;
      nodeKey = node.getKey();
      stripIdx = idx;
      caretIdx = caretOffset;
      remaining = full.slice(0, idx) + full.slice(caretOffset);
    });
    if (!found) return;

    // Reflect the strip in the live editor (deferred is fine — it's visual only).
    lexicalEditor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      node.setTextContent(full.slice(0, stripIdx) + full.slice(caretIdx));
      node.select(stripIdx, stripIdx);
    });
    editor.convertTo(handle.type, { ...(handle.empty?.() ?? {}), text: remaining });
    setOpen(false);
    setActiveIndex(0);
  }
  const handleSelectRef = useLatestRef(handleSelect);

  // Keyboard: registered ABOVE KeyboardPlugin (CRITICAL > HIGH) so menu nav wins
  // when visible, but falls through (return false) to split/focus-nav otherwise.
  useEffect(() => {
    const move = (delta: number) => {
      const list = filteredRef.current;
      if (list.length === 0) return;
      setActiveIndex((i) => (i + delta + list.length) % list.length);
    };

    const unregisterDown = lexicalEditor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        if (!visibleRef.current) return false;
        move(1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterUp = lexicalEditor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        if (!visibleRef.current) return false;
        move(-1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEnter = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!visibleRef.current) return false;
        const handle = filteredRef.current[activeIndexRef.current];
        if (!handle) return false;
        event?.preventDefault();
        handleSelectRef.current(handle);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEscape = lexicalEditor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (!visibleRef.current) return false;
        dismissedRef.current = true;
        setOpen(false);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    // Close on genuine blur (row clicks land via onMouseDown+preventDefault,
    // which keeps focus, so selecting a row never triggers this).
    const unregisterBlur = lexicalEditor.registerCommand(
      BLUR_COMMAND,
      () => {
        setOpen(false);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      unregisterDown();
      unregisterUp();
      unregisterEnter();
      unregisterEscape();
      unregisterBlur();
    };
  }, [lexicalEditor]);

  if (!visible || !caret) return null;

  return createPortal(
    <Surface
      ref={menuRef}
      level="overlay"
      // eslint-disable-next-line layout/no-adhoc-layout -- scroll body of JS-positioned floating menu (fixed + overflow entangled on one root)
      className="z-popover fixed max-h-80 w-56 overflow-y-auto p-xs"
      style={{ left: caret.left, top: caret.top + 4 }}
    >
      <BlockTypeList
        blocks={filtered}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onHoverIndex={setActiveIndex}
      />
    </Surface>,
    document.body,
  );
}
