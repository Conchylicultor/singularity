import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $getSelection, $isRangeSelection } from "lexical";
import { cn } from "@/lib/utils";
import { buildInitialConfig } from "../internal/lexical-config";
import { ImageUploadPlugin } from "../internal/image-upload-plugin";
import { EnterKeyPlugin } from "../internal/enter-key-plugin";
import { PromptEditorSlots } from "../slots";
import {
  applyMarkdownToEditor,
  serializeEditorToMarkdown,
} from "../internal/markdown";

// Drop-in replacement for a `<textarea>` that also supports pasting/dropping
// images (rendered inline as rich thumbnails). The `value` prop is markdown
// text — images are stored as `![alt](/api/attachments/<id>)` references and
// the surrounding text is plain.
//
// Two-way sync between the controlled `value` prop and the Lexical editor is
// guarded with a self-write flag so external updates and internal edits don't
// echo into a feedback loop.
//
// `submitMode` controls the Enter-to-submit behavior:
//   - "enter"     — Enter submits, Shift+Enter inserts newline (chat-style).
//   - "cmd-enter" — Cmd/Ctrl+Enter submits, Enter inserts newline (textarea-style).
//   - "none"      — onSubmit is never fired.
export function PromptEditor({
  value,
  onChange,
  onSubmit,
  submitMode = "cmd-enter",
  placeholder,
  disabled,
  autoFocus,
  className,
  minRows = 3,
  maxHeight,
  namespace = "prompt-editor",
  onError,
  insertRef,
}: {
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
  const initialConfig = useMemo(
    () =>
      buildInitialConfig({
        namespace,
        onError: (err) =>
          onError?.(err instanceof Error ? err.message : String(err)),
      }),
    [namespace, onError],
  );

  // Suppress the very-first deserialize echo so we don't fire onChange with
  // the markdown re-serialization of our own initial input.
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorShell
        placeholder={placeholder}
        disabled={!!disabled}
        autoFocus={!!autoFocus}
        className={className}
        minRows={minRows}
        maxHeight={maxHeight}
      />
      <ValueSyncPlugin value={value} onChange={onChange} />
      <ImageUploadPlugin onError={onError} />
      {onSubmit && submitMode !== "none" && (
        <EnterKeyPlugin onSubmit={onSubmit} submitMode={submitMode} />
      )}
      {insertRef && <InsertPlugin insertRef={insertRef} />}
      <HistoryPlugin />
    </LexicalComposer>
  );
}

function InsertPlugin({
  insertRef,
}: {
  insertRef: React.MutableRefObject<((text: string) => void) | null>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    insertRef.current = (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
        } else {
          $getRoot().selectStart();
          const sel = $getSelection();
          if ($isRangeSelection(sel)) sel.insertText(text);
        }
      });
    };
    return () => {
      insertRef.current = null;
    };
  }, [editor, insertRef]);
  return null;
}

function EditorShell({
  placeholder,
  disabled,
  autoFocus,
  className,
  minRows,
  maxHeight,
}: {
  placeholder?: string;
  disabled: boolean;
  autoFocus: boolean;
  className?: string;
  minRows: number;
  maxHeight?: string;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (autoFocus && !disabled) editor.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: focus once on initial render
  }, []);

  const minHeight = `${Math.max(minRows, 1) * 1.5}rem`;

  return (
    <div className="relative w-full min-w-0">
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            style={{ minHeight, maxHeight }}
            className={cn(
              "border-input bg-transparent rounded-md border px-2.5 py-1.5 text-sm leading-5 outline-none transition-colors resize-none",
              "overflow-y-auto",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:bg-input/50 aria-disabled:opacity-50",
              "dark:bg-input/30 dark:aria-disabled:bg-input/80",
              className,
            )}
            aria-disabled={disabled}
            aria-placeholder={placeholder ?? ""}
            placeholder={
              <div className="text-muted-foreground pointer-events-none absolute inset-0 px-2.5 py-1.5 text-sm leading-5">
                {placeholder ?? ""}
              </div>
            }
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <FloatingActionAnchor />
    </div>
  );
}

function FloatingActionAnchor() {
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
          $getRoot().selectStart();
          const sel = $getSelection();
          if ($isRangeSelection(sel)) sel.insertText(text);
        }
      });
    },
    [editor],
  );

  if (!editable || items.length === 0) return null;
  return (
    <div className="absolute bottom-1.5 right-1.5 z-10 pointer-events-none">
      <PromptEditorSlots.FloatingAction.Render>
        {(item) => (
          <div className="pointer-events-auto">
            <item.component insertText={insertText} />
          </div>
        )}
      </PromptEditorSlots.FloatingAction.Render>
    </div>
  );
}

// Two-way sync: external `value` → editor on change; editor → external via
// onChange. Self-write flag breaks the loop so a re-render of the same value
// doesn't get re-applied while the user is mid-edit.
function ValueSyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (markdown: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const selfWriteRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // External → editor (only when external value differs from our last
  // serialization; avoids round-tripping our own emit).
  useEffect(() => {
    if (lastSerializedRef.current === value) return;
    selfWriteRef.current = true;
    applyMarkdownToEditor(editor, value);
    lastSerializedRef.current = value;
    queueMicrotask(() => {
      selfWriteRef.current = false;
    });
  }, [editor, value]);

  // Editor → external.
  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (selfWriteRef.current) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      const md = serializeEditorToMarkdown(editor);
      if (md === lastSerializedRef.current) return;
      lastSerializedRef.current = md;
      onChangeRef.current(md);
    });
  }, [editor]);

  return null;
}
