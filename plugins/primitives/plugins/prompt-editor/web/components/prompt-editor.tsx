import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $getRoot } from "lexical";
import {
  TextEditor,
  useInsertMarkdown,
} from "@plugins/primitives/plugins/text-editor/web";
import { PromptEditorSlots } from "../slots";

type FloatingActionItem = Parameters<
  NonNullable<
    React.ComponentProps<
      typeof PromptEditorSlots.FloatingAction.Render
    >["children"]
  >
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

  // The editor's own insert — same path as the imperative `insertRef` handle,
  // so a template snippet lands exactly like any other: line breaks as line
  // breaks, tokens as their nodes, at the caret (or the end when there is none).
  const insertText = useInsertMarkdown();

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
    (item: FloatingActionItem) => {
      const dimmed =
        !editable && !item.alwaysActive ? disabledPartCls : undefined;
      const action = (
        <item.component
          insertText={insertText}
          getContent={getContent}
          clearContent={clearContent}
        />
      );
      // This box carries the disabled dimming, and it sits INSIDE the slot's own
      // per-contribution cell — so it is also where that cell's chain continues.
      // A contribution the cell grew for would shrink-wrap here and hand its own
      // content back to itself as "the room I have": `fill` has to be relayed,
      // not just declared once.
      return item.fill ? (
        <Fill className={dimmed}>{action}</Fill>
      ) : (
        // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf wrapper relaying the slot cell's shrink chain onto an arbitrary contributed action component
        <div className={cn("min-w-0", dimmed)}>{action}</div>
      );
    },
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
      <PromptEditorSlots.FloatingAction.Render>
        {renderItem}
      </PromptEditorSlots.FloatingAction.Render>
    </Stack>
  );
}
