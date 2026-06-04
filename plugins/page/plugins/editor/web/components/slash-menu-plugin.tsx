import { useEffect, useRef, useState } from "react";
import {
  $getRoot,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Block, BlockHandle } from "../../core";
import type { BlockEditorAPI } from "../types";
import {
  BlockTypeList,
  filterBlockTypes,
  useInsertableBlocks,
} from "./block-type-list";

/**
 * Inline, Notion-style slash menu. The menu is driven entirely by the block's
 * text (focus never leaves the editor): typing `/` opens it, the text after the
 * `/` filters it, arrows/Enter navigate, Esc dismisses, and selecting a type
 * either clears the `/query` (same type) or converts the block (different type).
 *
 * LIMITATION: only a *leading* `/` triggers the menu. A `/` typed mid-line is
 * intentionally out of scope.
 */
export function SlashMenuPlugin({
  block,
  editor,
}: {
  block: Block;
  editor: BlockEditorAPI;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const insertable = useInsertableBlocks();

  // Open-state + query derived from the live editor text.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // The Esc-dismissal latch: once set, the menu stays closed until the leading
  // `/` is removed from the text.
  const dismissedRef = useRef(false);

  const filtered = filterBlockTypes(insertable, query);

  // Refs let the (stable) Lexical command callbacks read fresh state — the
  // closures capture stale values otherwise (mirrors keyboard-plugin's editorRef).
  const openRef = useRef(open);
  openRef.current = open;
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // Track the text and recompute open-state + query on every editor update.
  useEffect(() => {
    function sync() {
      lexicalEditor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        const hasSlashPrefix = text.startsWith("/");
        if (!hasSlashPrefix) {
          // Prefix gone → reset the Esc latch and close.
          dismissedRef.current = false;
          setOpen(false);
          setQuery("");
          return;
        }
        setQuery(text.slice(1));
        setOpen(!dismissedRef.current);
      });
    }
    sync();
    return lexicalEditor.registerUpdateListener(sync);
  }, [lexicalEditor]);

  // Reset the active row whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, insertable.length]);

  function handleSelect(handle: BlockHandle<unknown>) {
    // Always strip the `/query` from the live editor. Text-like target types
    // share one renderer, so the conversion reconciles in place (the editor is
    // not remounted) — without this the `/query` text would linger.
    lexicalEditor.update(() => {
      $getRoot().clear();
    });
    if (handle.type !== block.type) {
      editor.convertTo(handle.type, handle.empty?.() ?? {});
    }
    setOpen(false);
    setActiveIndex(0);
  }
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;

  // Keyboard: registered ABOVE KeyboardPlugin (CRITICAL > HIGH) so menu nav wins
  // when open, but falls through (return false) to split/focus-nav when closed.
  useEffect(() => {
    const move = (delta: number) => {
      const list = filteredRef.current;
      if (list.length === 0) return;
      setActiveIndex((i) => (i + delta + list.length) % list.length);
    };

    const unregisterDown = lexicalEditor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        if (!openRef.current) return false;
        move(1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterUp = lexicalEditor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        if (!openRef.current) return false;
        move(-1);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterEnter = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!openRef.current) return false;
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
        if (!openRef.current) return false;
        dismissedRef.current = true;
        setOpen(false);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      unregisterDown();
      unregisterUp();
      unregisterEnter();
      unregisterEscape();
    };
  }, [lexicalEditor]);

  if (!open || filtered.length === 0) return null;

  return (
    <div className="bg-popover absolute left-0 top-full z-50 mt-1 w-56 rounded-md border p-1 shadow-md">
      <BlockTypeList
        blocks={filtered}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onHoverIndex={setActiveIndex}
      />
    </div>
  );
}
