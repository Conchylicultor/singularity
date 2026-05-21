import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { cn } from "@/lib/utils";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { PromptEditorSlots } from "../slots";

export function PromptEditor(props: {
  value: string;
  onChange: (markdown: string) => void;
  onSubmit?: () => void;
  submitMode?: "enter" | "cmd-enter" | "none";
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  minRows?: number;
  maxHeight?: string;
  namespace?: string;
  onError?: (msg: string) => void;
  insertRef?: React.MutableRefObject<((text: string) => void) | null>;
}) {
  return <TextEditor {...props} bottomSlot={<ToolbarRow />} />;
}

const disabledPartCls = "opacity-50 pointer-events-none select-none";

function ToolbarRow() {
  const [editor] = useLexicalComposerContext();
  const [editable, setEditable] = useState(() => editor.isEditable());
  const items = PromptEditorSlots.FloatingAction.useContributions();

  useEffect(() => {
    return editor.registerEditableListener(setEditable);
  }, [editor]);

  const insertText = useCallback(
    (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
        } else {
          $getRoot().selectEnd();
          const sel = $getSelection();
          if ($isRangeSelection(sel)) sel.insertText(text);
        }
      });
    },
    [editor],
  );

  const getContent = useCallback(() => {
    let text = "";
    editor.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    return text;
  }, [editor]);

  const clearContent = useCallback(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode());
    });
  }, [editor]);

  const focusEditor = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        editor.focus();
      }
    },
    [editor],
  );

  const hasAlwaysActive = !editable && items.some((i) => i.alwaysActive);
  if (items.length === 0) return null;
  if (!editable && !hasAlwaysActive) return null;
  return (
    <div className="flex items-center px-2 pb-1.5" onMouseDown={focusEditor}>
      <PromptEditorSlots.FloatingAction.Render>
        {(item) => (
          <div className={cn("min-w-0", !editable && !item.alwaysActive && disabledPartCls)}>
            <item.component
              insertText={insertText}
              getContent={getContent}
              clearContent={clearContent}
            />
          </div>
        )}
      </PromptEditorSlots.FloatingAction.Render>
    </div>
  );
}
