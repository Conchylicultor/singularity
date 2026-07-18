import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useMemo, useRef } from "react";
import { useEventCallback, useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  type LexicalEditor,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { buildInitialConfig } from "../internal/lexical-config";
import { EnterKeyPlugin } from "../internal/enter-key-plugin";
import { DecoratorNavPlugin } from "../internal/decorator-nav-plugin";
import { DecoratorBlockPlugin } from "../internal/decorator-block-plugin";
import { TextEditorSlots, useMergedNodeExtensions } from "../slots";
import type { NodeExtension } from "../internal/node-extensions";
import {
  applyMarkdownToEditor,
  serializeEditorToMarkdown,
  $insertMarkdownSnippet,
  $selectMarkdownRange,
} from "../internal/markdown";

export interface TextEditorProps {
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
  // Character range [start, end] in the raw `value` to select on mount.
  // Used to open the editor with a span pre-selected (e.g. drag-select-to-edit).
  initialSelection?: { start: number; end: number } | null;
  bottomSlot?: React.ReactNode;
}

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
  initialSelection,
  bottomSlot,
}: TextEditorProps) {
  const extensions = useMergedNodeExtensions();
  // The Lexical composer must know every node class up-front and must not be
  // rebuilt (that remounts the editor). The node-class set is fixed at boot, so
  // key the config on the node types — `extensions` identity churns each render.
  const nodeKey = extensions.map((ext) => ext.node.getType()).join("|");
  const initialConfig = useMemo(
    () =>
      buildInitialConfig({
        namespace,
        onError: (err) =>
          onError?.(err instanceof Error ? err.message : String(err)),
        extensions,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeKey captures the boot-stable node-class set; `extensions` identity churns each render
    [namespace, onError, nodeKey],
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
      <ValueSyncPlugin value={value} onChange={onChange} extensions={extensions} />
      {initialSelection && (
        <InitialSelectionPlugin
          selection={initialSelection}
          extensions={extensions}
        />
      )}
      <PluginSlot onError={onError} />
      <DecoratorNavPlugin />
      <DecoratorBlockPlugin />
      {onSubmit && submitMode !== "none" && (
        <EnterKeyPlugin onSubmit={onSubmit} submitMode={submitMode} />
      )}
      {insertRef && (
        <InsertPlugin insertRef={insertRef} extensions={extensions} />
      )}
      <HistoryPlugin />
    </LexicalComposer>
  );
}

// Imperative insert-at-caret handle. Goes through `$insertMarkdownSnippet`, so
// the snippet is deserialized by the node extensions on the way in (a
// `<ui-context …>` tag lands as its chip) exactly as it would through the value
// round-trip, and the caret is left after the insertion so the user keeps typing.
function InsertPlugin({
  insertRef,
  extensions,
}: {
  insertRef: React.MutableRefObject<((text: string) => void) | null>;
  extensions: readonly NodeExtension[];
}) {
  const [editor] = useLexicalComposerContext();
  const extensionsRef = useLatestRef(extensions);
  useEffect(() => {
    insertRef.current = (text: string) => {
      editor.update(
        () => {
          $insertMarkdownSnippet(text, extensionsRef.current);
        },
        { onUpdate: () => editor.focus() },
      );
    };
    return () => {
      insertRef.current = null;
    };
  }, [editor, insertRef, extensionsRef]);
  return null;
}

// Selects a raw-string character range once on mount. Rendered after
// ValueSyncPlugin so its mount effect runs after the value has been applied to
// the editor (React fires sibling effects in render order), guaranteeing the
// target nodes exist before we place the selection.
function InitialSelectionPlugin({
  selection,
  extensions,
}: {
  selection: { start: number; end: number };
  extensions: readonly NodeExtension[];
}) {
  const [editor] = useLexicalComposerContext();
  const extensionsRef = useLatestRef(extensions);
  const selectionRef = useLatestRef(selection);
  useEffect(() => {
    editor.focus();
    editor.update(() => {
      const { start, end } = selectionRef.current;
      $selectMarkdownRange(start, end, extensionsRef.current);
    });
    // Mount-only: apply the captured selection once. `editor` is stable and the
    // refs are stable useLatestRef handles, so the effect never re-runs.
  }, [editor]);
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
      // eslint-disable-next-line layout/no-adhoc-layout -- min-w-0 lets the self-contained editor box shrink below its content width inside an arbitrary external flex parent
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
              // eslint-disable-next-line layout/no-adhoc-layout -- overflow-y-auto configures the scroll on Lexical's third-party ContentEditable element (its own clamped editor viewport), not a primitive boundary
              className={cn(
                "px-sm py-xs text-body outline-none resize-none",
                "overflow-y-auto",
                className,
              )}
              aria-disabled={disabled}
              aria-placeholder={placeholder ?? ""}
              placeholder={
                // eslint-disable-next-line layout/no-adhoc-layout -- decorative full-bleed placeholder overlay rendered into Lexical's PlainTextPlugin placeholder slot (third-party DOM structure); cannot route through <Overlay above>
                <div className="text-muted-foreground pointer-events-none absolute inset-0 px-sm py-xs text-body">
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

function editorHasFocus(editor: LexicalEditor): boolean {
  const root = editor.getRootElement();
  return !!root && root.contains(document.activeElement);
}

// Owns the inbound half of the two-way markdown sync. An external `value` change
// rebuilds the whole document (`root.clear()` + reparse), which destroys the
// caret/selection/scroll — harmless when the editor isn't focused, destructive
// mid-edit. This plugin owns the invariant so no consumer has to: a replacement
// is never applied to a FOCUSED editor; it is parked and applied on blur, unless
// the user's own edits have since superseded it (the draft wins).
// See research/2026-07-18-primitives-text-editor-external-value-guard.md.
// Exported for the co-located jsdom test (web/__tests__/value-sync.test.tsx);
// not re-exported from the plugin barrel.
export function ValueSyncPlugin({
  value,
  onChange,
  extensions,
}: {
  value: string;
  onChange: (markdown: string) => void;
  extensions: readonly NodeExtension[];
}) {
  const [editor] = useLexicalComposerContext();
  const selfWriteRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  // A replacement `value` that arrived while the editor was focused, held back
  // to apply on blur so it never clobbers the user's live caret/selection.
  const pendingExternalRef = useRef<string | null>(null);
  // Editor focus, tracked via Lexical's FOCUS/BLUR commands (the same
  // event-driven signal the caret-trigger primitive uses).
  const focusedRef = useRef(false);
  const onChangeRef = useLatestRef(onChange);
  // Read fresh inside effects so the (boot-stable) extension set is never a
  // dependency that would re-run the markdown sync.
  const extensionsRef = useLatestRef(extensions);

  // Apply an external value as a full-document replacement. Guarded by
  // selfWriteRef so the update listener it triggers is a no-op (not echoed back
  // out through onChange). Stable identity so the effects below don't re-run.
  const applyValue = useEventCallback((next: string) => {
    selfWriteRef.current = true;
    applyMarkdownToEditor(editor, next, extensionsRef.current);
    lastSerializedRef.current = next;
    queueMicrotask(() => {
      selfWriteRef.current = false;
    });
  });

  useEffect(() => {
    // Initialize from the DOM in case the editor was autofocused (by
    // EditorShell's mount effect, a sibling that runs before this one) before
    // this effect registered its FOCUS listener.
    focusedRef.current = editorHasFocus(editor);
    const unFocus = editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        focusedRef.current = true;
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        focusedRef.current = false;
        // The caret is gone, so a parked replacement can safely land — unless a
        // value that catches up to the edited content already cleared it, or the
        // user's own edits superseded it (both leave nothing to apply).
        const pending = pendingExternalRef.current;
        pendingExternalRef.current = null;
        if (pending !== null && pending !== lastSerializedRef.current) {
          applyValue(pending);
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unFocus();
      unBlur();
    };
  }, [editor, applyValue]);

  useEffect(() => {
    if (lastSerializedRef.current === value) {
      // Content already equals the incoming value (e.g. a server echo of the
      // user's own edit): nothing to apply, and any parked value is now stale.
      pendingExternalRef.current = null;
      return;
    }
    // Carve-out: the FIRST apply (lastSerialized === null) seeds an empty editor
    // and must never be deferred, even if it is already autofocused — deferring
    // it would leave the editor blank until blur. Every later apply is a
    // replacement and is subject to the focus guard.
    const isReplacement = lastSerializedRef.current !== null;
    if (isReplacement && focusedRef.current) {
      pendingExternalRef.current = value;
      return;
    }
    pendingExternalRef.current = null;
    applyValue(value);
  }, [value, applyValue]);

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (selfWriteRef.current) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      const md = serializeEditorToMarkdown(editor, extensionsRef.current);
      if (md === lastSerializedRef.current) return;
      // A genuine user edit supersedes any parked external value: applying it on
      // blur would clobber the user's edit back to the stale server version.
      pendingExternalRef.current = null;
      lastSerializedRef.current = md;
      onChangeRef.current(md);
    });
  }, [editor]);

  return null;
}
