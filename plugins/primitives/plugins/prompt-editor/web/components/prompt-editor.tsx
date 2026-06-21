import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { PromptEditorSlots } from "../slots";

type FloatingActionItem = Parameters<
  NonNullable<React.ComponentProps<typeof PromptEditorSlots.FloatingAction.Render>["children"]>
>[0];

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

  const renderItem = useCallback(
    (item: FloatingActionItem) => (
      // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf wrapper letting an arbitrary contributed action component shrink within the toolbar Stack row
      <div className={cn("min-w-0", !editable && !item.alwaysActive && disabledPartCls)}>
        <item.component
          insertText={insertText}
          getContent={getContent}
          clearContent={clearContent}
        />
      </div>
    ),
    [editable, insertText, getContent, clearContent],
  );

  const hasAlwaysActive = !editable && items.some((i) => i.alwaysActive);
  if (items.length === 0) return null;
  if (!editable && !hasAlwaysActive) return null;
  return (
    <Stack
      direction="row"
      align="center"
      gap="xs"
      className="px-sm pb-xs"
      onMouseDown={focusEditor}
    >
      <PromptEditorSlots.FloatingAction.Render>{renderItem}</PromptEditorSlots.FloatingAction.Render>
    </Stack>
  );
}
