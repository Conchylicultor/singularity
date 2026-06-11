import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { textDataSchema, type Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import { ValueSyncPlugin } from "./value-sync-plugin";
import { KeyboardPlugin } from "./keyboard-plugin";
import { SlashMenuPlugin } from "./slash-menu-plugin";
import { MarkdownShortcutPlugin } from "./markdown-shortcut-plugin";
import { blockTextNodes, getBlockTextExtensions } from "../internal/block-text-extensions";
import { placeCaretAtBoundary, placeCaretAtColumn } from "../internal/caret-geometry";

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
  splitOptions,
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
  /** Enter-split options (e.g. nest the split-off content as a child). */
  splitOptions?: { asChild?: boolean; childType?: string };
}) {
  const data = textDataSchema.parse(block.data);
  const isEmpty = data.text.length === 0;
  const { registerFocusHandle, frozenIds } = useBlockEditor();
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);

  const field = useEditableField({
    value: data.text,
    // This editor owns only the `text` field; preserve any sibling data (e.g. a
    // to-do's `checked`) so saving text never clobbers it.
    onSave: (next) =>
      editor.update({ ...(block.data as Record<string, unknown>), text: next }),
    // While a structural op owns this block's text (split/merge in flight), the
    // server owns the field: mirror incoming `value`, never autosave — so a stale
    // blur-flush can't clobber the reducer's text edit.
    frozen: frozenIds.has(block.id),
  });

  const initialConfig = useMemo(
    () => ({
      namespace: `block-text-${block.id}`,
      theme: { paragraph: "m-0" },
      // Custom inline nodes (e.g. inline page links) contributed via
      // registerBlockTextExtension. Registered at app bootstrap, so present
      // before any block editor mounts.
      nodes: blockTextNodes(),
      onError: console.error,
    }),
    [block.id],
  );

  useEffect(() => {
    return registerFocusHandle(block.id, {
      focus: () => lexicalEditorRef.current?.focus(),
      focusAtColumn: (x, edge) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtColumn(ed, x, edge);
      },
      focusBoundary: (edge) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtBoundary(ed, edge);
      },
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
                className={cn("outline-none px-3 py-1 text-body", contentClassName)}
                onFocus={() => {
                  field.onFocus();
                  editor.onFocus();
                }}
                onBlur={field.onBlur}
              />
            }
            placeholder={
              isEmpty && isFocused && placeholder ? (
                <div className="text-muted-foreground pointer-events-none absolute left-0 top-0 px-3 py-1 text-body">
                  {placeholder}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ValueSyncPlugin value={field.value} onChange={field.onChange} />
          <KeyboardPlugin blockId={block.id} editor={editor} splitOptions={splitOptions} />
          <SlashMenuPlugin block={block} editor={editor} />
          <MarkdownShortcutPlugin block={block} editor={editor} />
          {getBlockTextExtensions().map((ext) =>
            ext.Plugin ? (
              <ext.Plugin key={ext.id} block={block} editor={editor} />
            ) : null,
          )}
          <EditorRefPlugin editorRef={lexicalEditorRef} />
        </div>
      </div>
    </LexicalComposer>
  );
}
