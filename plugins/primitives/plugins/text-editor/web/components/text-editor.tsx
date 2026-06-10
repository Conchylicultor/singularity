import { useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $getSelection, $isRangeSelection } from "lexical";
import { cn } from "@/lib/utils";
import { buildInitialConfig } from "../internal/lexical-config";
import { EnterKeyPlugin } from "../internal/enter-key-plugin";
import { TextEditorSlots } from "../slots";
import {
  applyMarkdownToEditor,
  serializeEditorToMarkdown,
} from "../internal/markdown";

export function TextEditor({
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
  namespace = "text-editor",
  onError,
  insertRef,
  bottomSlot,
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
  bottomSlot?: React.ReactNode;
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

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorShell
        placeholder={placeholder}
        disabled={!!disabled}
        autoFocus={!!autoFocus}
        className={className}
        minRows={minRows}
        maxHeight={maxHeight}
        bottomSlot={bottomSlot}
      />
      <ValueSyncPlugin value={value} onChange={onChange} />
      <PluginSlot onError={onError} />
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
  bottomSlot,
}: {
  placeholder?: string;
  disabled: boolean;
  autoFocus: boolean;
  className?: string;
  minRows: number;
  maxHeight?: string;
  bottomSlot?: React.ReactNode;
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
    <div
      className={cn(
        "focus-ring-within w-full min-w-0 rounded-md border transition-colors",
        "border-input",
        disabled
          ? "bg-input/50 dark:bg-input/80"
          : "bg-transparent dark:bg-input/30",
      )}
    >
      <div className={cn("relative", disabled && "opacity-50 pointer-events-none cursor-not-allowed")}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              style={{ minHeight, maxHeight }}
              className={cn(
                "px-2.5 py-1.5 text-body outline-none resize-none",
                "overflow-y-auto",
                className,
              )}
              aria-disabled={disabled}
              aria-placeholder={placeholder ?? ""}
              placeholder={
                <div className="text-muted-foreground pointer-events-none absolute inset-0 px-2.5 py-1.5 text-body">
                  {placeholder ?? ""}
                </div>
              }
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      {bottomSlot}
    </div>
  );
}

function PluginSlot({ onError }: { onError?: (msg: string) => void }) {
  return (
    <TextEditorSlots.Plugin.Render>
      {(item) => <item.component onError={onError} />}
    </TextEditorSlots.Plugin.Render>
  );
}

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

  useEffect(() => {
    if (lastSerializedRef.current === value) return;
    selfWriteRef.current = true;
    applyMarkdownToEditor(editor, value);
    lastSerializedRef.current = value;
    queueMicrotask(() => {
      selfWriteRef.current = false;
    });
  }, [editor, value]);

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
