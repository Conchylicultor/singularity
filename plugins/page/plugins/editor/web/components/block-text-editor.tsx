import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";
import { cn } from "@/lib/utils";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { textDataSchema, type Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import { ValueSyncPlugin } from "./value-sync-plugin";
import { KeyboardPlugin } from "./keyboard-plugin";
import { SlashMenuPlugin } from "./slash-menu-plugin";
import { MarkdownShortcutPlugin } from "./markdown-shortcut-plugin";

function EditorRefPlugin({ editorRef }: { editorRef: React.MutableRefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);
  return null;
}

/**
 * Reusable editable-text block renderer. Owns the entire Lexical pipeline —
 * value sync, structural keyboard handling, the slash menu, and the markdown
 * block-shortcut affordance — so every text-bearing block type (text,
 * bulleted-list, and future heading/quote/to-do types) is a thin wrapper that
 * supplies a `marker` and `placeholder`.
 */
export function BlockTextEditor({
  block,
  isFocused,
  editor,
  marker,
  placeholder,
  contentClassName,
}: {
  block: Block;
  isFocused: boolean;
  editor: BlockEditorAPI;
  /** Optional non-editable element rendered to the left of the text (e.g. a bullet). */
  marker?: ReactNode;
  /** Shown when the block is empty and focused. */
  placeholder?: ReactNode;
  /** Extra classes for the editable content (e.g. strikethrough when done). */
  contentClassName?: string;
}) {
  const data = textDataSchema.parse(block.data);
  const isEmpty = data.text.length === 0;
  const { registerFocusHandle } = useBlockEditor();
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);

  const field = useEditableField({
    value: data.text,
    // This editor owns only the `text` field; preserve any sibling data (e.g. a
    // to-do's `checked`) so saving text never clobbers it.
    onSave: (next) =>
      editor.update({ ...(block.data as Record<string, unknown>), text: next }),
  });

  const initialConfig = useMemo(
    () => ({
      namespace: `block-text-${block.id}`,
      theme: { paragraph: "m-0" },
      nodes: [],
      onError: console.error,
    }),
    [block.id],
  );

  useEffect(() => {
    return registerFocusHandle(block.id, {
      focus: () => lexicalEditorRef.current?.focus(),
    });
  }, [block.id, registerFocusHandle]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative flex">
        {marker}
        <div className="relative flex-1">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                className={cn("outline-none px-3 py-1 text-sm leading-6", contentClassName)}
                onFocus={() => {
                  field.onFocus();
                  editor.onFocus();
                }}
                onBlur={field.onBlur}
              />
            }
            placeholder={
              isEmpty && isFocused && placeholder ? (
                <div className="text-muted-foreground pointer-events-none absolute left-0 top-0 px-3 py-1 text-sm leading-6">
                  {placeholder}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ValueSyncPlugin value={field.value} onChange={field.onChange} />
          <KeyboardPlugin editor={editor} />
          <SlashMenuPlugin block={block} editor={editor} />
          <MarkdownShortcutPlugin block={block} editor={editor} />
          <EditorRefPlugin editorRef={lexicalEditorRef} />
        </div>
      </div>
    </LexicalComposer>
  );
}
