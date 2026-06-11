import { useEffect, useRef } from "react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { BlockEditorAPI } from "../types";
import { useSelectionControl } from "../selection-control";
import { serializeBlockText } from "../internal/block-text-extensions";

function getAbsoluteOffset(): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;

  const anchor = selection.anchor;
  const root = $getRoot();
  const children = root.getChildren();
  let offset = 0;

  for (const child of children) {
    if (child.getKey() === anchor.getNode().getKey() ||
        child.getKey() === anchor.getNode().getParent()?.getKey()) {
      return offset + anchor.offset;
    }
    offset += child.getTextContent().length + 1;
  }

  return null;
}

function isAtStart(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  if (!selection.isCollapsed()) return false;

  const anchor = selection.anchor;
  if (anchor.offset !== 0) return false;

  const root = $getRoot();
  const firstChild = root.getFirstChild();
  if (!firstChild) return true;

  const anchorNode = anchor.getNode();
  return anchorNode.getKey() === firstChild.getKey() ||
    anchorNode.getParent()?.getKey() === firstChild.getKey();
}

function isAtEnd(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  if (!selection.isCollapsed()) return false;

  const root = $getRoot();
  const lastChild = root.getLastChild();
  if (!lastChild) return true;

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  const inLastParagraph =
    anchorNode.getKey() === lastChild.getKey() ||
    anchorNode.getParent()?.getKey() === lastChild.getKey();
  if (!inLastParagraph) return false;

  return anchor.offset === lastChild.getTextContent().length;
}

export function KeyboardPlugin({
  blockId,
  editor,
  splitOptions,
}: {
  blockId: string;
  editor: BlockEditorAPI;
  splitOptions?: { asChild?: boolean; childType?: string };
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const splitOptionsRef = useRef(splitOptions);
  splitOptionsRef.current = splitOptions;
  const selection = useSelectionControl();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;

  useEffect(() => {
    const unregisterEnter = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        if (event.isComposing) return false;
        if (event.shiftKey) return false;

        event.preventDefault();
        let offset: number | null = null;
        lexicalEditor.getEditorState().read(() => {
          offset = getAbsoluteOffset();
        });
        if (offset !== null) {
          // Serialize OUTSIDE the read above — `serializeBlockText` opens its
          // own read, and nested reads would throw.
          const text = serializeBlockText(lexicalEditor);
          editorRef.current.split(offset, { ...splitOptionsRef.current, text });
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterBackspace = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        let shouldMerge = false;
        lexicalEditor.getEditorState().read(() => {
          shouldMerge = isAtStart();
        });
        if (shouldMerge) {
          // Prevent the native backspace: `merge()` may de-indent or move the
          // caret to the previous block, and an unprevented default would then
          // delete a character from whatever block ends up focused.
          event?.preventDefault();
          const text = serializeBlockText(lexicalEditor);
          editorRef.current.merge({ text });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterTab = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_TAB_COMMAND,
      (event) => {
        if (!event) return false;
        event.preventDefault();
        if (event.shiftKey) {
          editorRef.current.outdent();
        } else {
          editorRef.current.indent();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterArrowUp = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        let atStart = false;
        lexicalEditor.getEditorState().read(() => {
          atStart = isAtStart();
        });
        if (!atStart) return false;
        // Shift+Up at the top of a block starts a block selection toward the
        // previous block; plain Up moves the caret to it.
        if (event?.shiftKey && selectionRef.current) {
          event.preventDefault();
          selectionRef.current.enterSelectionMode(blockIdRef.current, "up");
          return true;
        }
        editorRef.current.focusUp();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterArrowDown = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        let atEnd = false;
        lexicalEditor.getEditorState().read(() => {
          atEnd = isAtEnd();
        });
        if (!atEnd) return false;
        if (event?.shiftKey && selectionRef.current) {
          event.preventDefault();
          selectionRef.current.enterSelectionMode(blockIdRef.current, "down");
          return true;
        }
        editorRef.current.focusDown();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterEscape = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!selectionRef.current) return false;
        event?.preventDefault();
        // Leave text editing and select this whole block (block-selection mode).
        selectionRef.current.enterSelectionMode(blockIdRef.current);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterEnter();
      unregisterBackspace();
      unregisterTab();
      unregisterArrowUp();
      unregisterArrowDown();
      unregisterEscape();
    };
  }, [lexicalEditor]);

  return null;
}
