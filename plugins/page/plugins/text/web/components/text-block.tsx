import { useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useBlockEditor, type BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { textBlock } from "../../core";
import { ValueSyncPlugin } from "./value-sync-plugin";
import { KeyboardPlugin } from "./keyboard-plugin";

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

export function TextBlock({ block, editor }: BlockRendererProps) {
  const data = textBlock.parse(block.data);
  const { registerFocusHandle } = useBlockEditor();
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);

  const field = useEditableField({
    value: data.text,
    onSave: (next) => editor.update({ text: next }),
  });

  const initialConfig = useMemo(
    () => ({
      namespace: `text-block-${block.id}`,
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
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            className="outline-none px-3 py-1 text-sm leading-6"
            onFocus={() => {
              field.onFocus();
              editor.onFocus();
            }}
            onBlur={field.onBlur}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ValueSyncPlugin value={field.value} onChange={field.onChange} />
      <KeyboardPlugin editor={editor} />
      <EditorRefPlugin editorRef={lexicalEditorRef} />
    </LexicalComposer>
  );
}
