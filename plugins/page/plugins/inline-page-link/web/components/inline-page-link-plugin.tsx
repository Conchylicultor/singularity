import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  $createTextNode,
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
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import {
  usePageOptions,
  PageOptionsList,
  type BlockTextPluginProps,
  type PageOption,
} from "@plugins/page/plugins/editor/web";
import { $createPageLinkInlineNode } from "./page-link-inline-node";
import { createLinkedPage } from "../internal/create-linked-page";

const TRIGGER = "[[";

/**
 * Inline, Notion-style `[[` page-mention typeahead. Mirrors the editor's slash
 * menu: open-state + query are derived from the live editor text (focus never
 * leaves the editor); arrows/Enter navigate, Esc dismisses. Unlike the slash menu
 * — which can anchor to the block because `/` is always leading — `[[` is
 * mid-line, so the menu is portaled and positioned at the caret rect.
 *
 * On select, the `[[query` is replaced with an inline page-link node (+ a trailing
 * space); for "Create '<query>'" a new page is created first. The node persists as
 * a `[[<pageId>]]` token via the block-text extension's serializer.
 */
export function InlinePageLinkPlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState<{ left: number; top: number } | null>(null);

  // Esc-dismissal latch: stays closed until the `[[` trigger is removed.
  const dismissedRef = useRef(false);

  const pageOptionsResult = usePageOptions(query, { allowCreate: true });
  // Use settled options for keyboard navigation; [] while pending is safe here
  // because commands return false (no-op) when the list is empty, and the menu
  // shows a loading spinner rather than "No pages found".
  const options = pageOptionsResult.pending ? [] : pageOptionsResult.options;

  // Refs let the stable Lexical command callbacks read fresh state.
  const openRef = useRef(open);
  openRef.current = open;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

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
        const q = upToCaret.slice(idx + TRIGGER.length);
        // A `[`, `]`, or newline ends the mention — reset the latch and close.
        if (/[[\]\n]/.test(q)) {
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

  // Reset the active row whenever the option set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, options.length]);

  function insertLink(pageId: string) {
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
      const link = $createPageLinkInlineNode(pageId);
      const space = $createTextNode(" ");
      node.insertAfter(link);
      link.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
    setOpen(false);
    setActiveIndex(0);
  }

  function handleSelect(option: PageOption) {
    if (option.kind === "page") {
      insertLink(option.page.id);
    } else {
      void createLinkedPage(option.title).then((id) => insertLink(id));
    }
  }
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;

  // Keyboard: registered ABOVE KeyboardPlugin (CRITICAL > HIGH) so menu nav wins
  // when open, but falls through (return false) to split/focus-nav when closed.
  useEffect(() => {
    const move = (delta: number) => {
      const list = optionsRef.current;
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
        const option = optionsRef.current[activeIndexRef.current];
        if (!option) return false;
        event?.preventDefault();
        handleSelectRef.current(option);
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
    // Close on genuine blur (clicks land via onMouseDown+preventDefault, which
    // keeps focus, so selecting a row never triggers this).
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

  if (!open || !caret) return null;

  return createPortal(
    <Surface
      level="overlay"
      className="z-popover fixed w-72 p-xs"
      style={{ left: caret.left, top: caret.top + 4 }}
    >
      <div className="max-h-64 overflow-y-auto">
        {pageOptionsResult.pending ? (
          <Loading variant="rows" />
        ) : (
          <PageOptionsList
            options={pageOptionsResult.options}
            activeIndex={activeIndex}
            onSelect={(id) => insertLink(id)}
            onCreate={(title) => void createLinkedPage(title).then((id) => insertLink(id))}
            onHoverIndex={setActiveIndex}
          />
        )}
      </div>
    </Surface>,
    document.body,
  );
}
