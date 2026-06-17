import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdCalendarToday, MdNotificationsActive } from "react-icons/md";
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
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import type { BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
import { $createDateMentionNode } from "./date-mention-node";
import { buildMenu, type DateOption } from "../internal/date-options";

const TRIGGER = "@";

/**
 * Inline, Notion-style `@` date/reminder typeahead. Mirrors the inline page-link
 * (`[[`) plugin: open-state + query are derived from the live editor text (focus
 * never leaves the editor); arrows/Enter navigate, Esc dismisses; the menu is
 * portaled and positioned at the caret rect since `@` appears mid-line.
 *
 * The query is parsed by chrono into a concrete instant. Selecting the "date" row
 * inserts a `[[date:<iso>]]` chip; the "reminder" row mints a UUID and inserts a
 * `[[reminder:<id>:<iso>]]` chip that the server schedules a notification for.
 */
export function InlineDatePlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState<{ left: number; top: number } | null>(null);

  // Esc-dismissal latch: stays closed until the `@` trigger is removed.
  const dismissedRef = useRef(false);

  const menu = useMemo(() => buildMenu(query, new Date()), [query]);
  const options = menu.options;

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
        // `@` must start a word: preceded by start-of-text or whitespace, so it
        // doesn't trigger inside emails or handles the user types deliberately.
        const before = idx > 0 ? upToCaret[idx - 1] : "";
        if (before && !/\s/.test(before)) {
          dismissedRef.current = false;
          close();
          return;
        }
        const q = upToCaret.slice(idx + TRIGGER.length);
        // A newline or a second `@` ends the mention — reset the latch and close.
        if (/[@\n]/.test(q)) {
          dismissedRef.current = false;
          close();
          return;
        }
        const model = buildMenu(q, new Date());
        if (!model.open) {
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

  function insertMention(option: DateOption) {
    const iso = option.date.toISOString();
    const reminderId = option.kind === "reminder" ? crypto.randomUUID() : null;
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
      const mention = $createDateMentionNode(iso, reminderId);
      const space = $createTextNode(" ");
      node.insertAfter(mention);
      mention.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
    setOpen(false);
    setActiveIndex(0);
  }
  const insertRef = useRef(insertMention);
  insertRef.current = insertMention;

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
        insertRef.current(option);
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
      {menu.hint ? (
        <Text as="div" variant="body" className="text-muted-foreground px-sm py-xs">
          Keep typing a date…
        </Text>
      ) : (
        <div className="flex flex-col">
          {options.map((option, i) => (
            <Row
              key={`${option.kind}-${i}`}
              selected={i === activeIndex}
              icon={
                option.kind === "reminder" ? (
                  <MdNotificationsActive className="text-muted-foreground" />
                ) : (
                  <MdCalendarToday className="text-muted-foreground" />
                )
              }
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e: React.MouseEvent) => {
                e.preventDefault();
                insertMention(option);
              }}
            >
              <span className="truncate">{option.label}</span>
            </Row>
          ))}
        </div>
      )}
    </Surface>,
    document.body,
  );
}
