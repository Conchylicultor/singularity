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
  KEY_TAB_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";

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

export function KeyboardPlugin({ editor }: { editor: BlockEditorAPI }) {
  const [lexicalEditor] = useLexicalComposerContext();
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    const unregisterEnter = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        if (event.isComposing) return false;
        if (event.shiftKey) return false;

        event.preventDefault();
        lexicalEditor.getEditorState().read(() => {
          const offset = getAbsoluteOffset();
          if (offset !== null) {
            editorRef.current.split(offset);
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterBackspace = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_BACKSPACE_COMMAND,
      () => {
        let shouldMerge = false;
        lexicalEditor.getEditorState().read(() => {
          shouldMerge = isAtStart();
        });
        if (shouldMerge) {
          editorRef.current.merge();
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
      () => {
        let atStart = false;
        lexicalEditor.getEditorState().read(() => {
          atStart = isAtStart();
        });
        if (atStart) {
          editorRef.current.focusUp();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterArrowDown = lexicalEditor.registerCommand<KeyboardEvent | null>(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        let atEnd = false;
        lexicalEditor.getEditorState().read(() => {
          atEnd = isAtEnd();
        });
        if (atEnd) {
          editorRef.current.focusDown();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterEnter();
      unregisterBackspace();
      unregisterTab();
      unregisterArrowUp();
      unregisterArrowDown();
    };
  }, [lexicalEditor]);

  return null;
}
