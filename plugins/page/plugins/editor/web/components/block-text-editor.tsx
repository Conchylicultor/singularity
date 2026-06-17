import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LinkNode } from "@lexical/link";
import type { LexicalEditor } from "lexical";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { runsOf, type Block, type BlockTextVariant, type RichText } from "../../core";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import { ValueSyncPlugin } from "./value-sync-plugin";
import { KeyboardPlugin } from "./keyboard-plugin";
import { SlashMenuPlugin } from "./slash-menu-plugin";
import { MarkdownShortcutPlugin } from "./markdown-shortcut-plugin";
import { FormatToolbarPlugin } from "./format-toolbar-plugin";
import { FormatShortcutsPlugin } from "./format-shortcuts-plugin";
import { blockTextNodes, getBlockTextExtensions } from "../internal/block-text-extensions";
import { isValidLinkUrl } from "../internal/link-url";
import {
  placeCaretAtBoundary,
  placeCaretAtColumn,
  placeCaretAtOffset,
} from "../internal/caret-geometry";
import "./block-document-scale.css";

/**
 * Width of the leading-marker gutter — the fixed column that holds a block's
 * bullet / number / checkbox / icon to the LEFT of its text. Every text block
 * routes its marker through this one column, so the text content edge is
 * identical across all marker types (bulleted, numbered, to-do, …) — the
 * Notion `notion-list-item-box-left` model. Wider markers (e.g. the callout
 * icon) expand the column via `min-width` without shifting narrow ones.
 */
const MARKER_GUTTER = "1.5rem";

// Maps a semantic typography variant to its document-scale role. The block
// editor is a *document* surface, so its editable text uses the larger, airier
// `doc-text-*` reading scale (Notion parity) rather than the dense UI-chrome
// `text-*` utilities. See block-document-scale.css for the rationale.
const VARIANT_CLASS: Record<BlockTextVariant, string> = {
  title: "doc-text-title",
  heading: "doc-text-heading",
  subheading: "doc-text-subheading",
  body: "doc-text-body",
  label: "doc-text-label",
  caption: "doc-text-caption",
};

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
  textVariant,
  inset = true,
}: {
  block: Block;
  isFocused: boolean;
  editor: BlockEditorAPI;
  /** Optional non-editable element rendered in the leading-marker gutter (e.g. a bullet). */
  marker?: ReactNode;
  /** Shown when the block is empty and focused. */
  placeholder?: ReactNode;
  /** Extra classes for the editable content (e.g. strikethrough when done). */
  contentClassName?: string;
  /** Semantic typography variant for the editable text and placeholder. */
  textVariant: BlockTextVariant;
  /**
   * Whether the editor supplies the page-level left text inset itself. Plain
   * blocks (the default) sit directly on the page rail and want it; blocks that
   * already wrap themselves in a padded container (e.g. the callout box) own
   * that inset and pass `inset={false}` so it isn't applied twice.
   */
  inset?: boolean;
}) {
  const runs = runsOf((block.data as Record<string, unknown> | null)?.text);
  const isEmpty = runs.length === 0;
  const { registerFocusHandle, frozenIds } = useBlockEditor();
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);

  // `useEditableField` is a string-keyed debounced-autosave hook (self-echo
  // suppression via `Object.is`). Rich text is structured, so we carry its
  // canonical JSON form through the field — a stable string key that `Object.is`
  // compares correctly — and parse/serialize at the boundary (ValueSyncPlugin
  // does the JSON↔Lexical translation).
  const serialized = useMemo(() => JSON.stringify(runs), [runs]);

  const field = useEditableField<string>({
    value: serialized,
    // This editor owns only the `text` field; preserve any sibling data (e.g. a
    // to-do's `checked`) so saving text never clobbers it.
    onSave: (nextJson) => {
      const next = JSON.parse(nextJson) as RichText;
      editor.update({ ...(block.data as Record<string, unknown>), text: next });
    },
    // While a structural op owns this block's text (split/merge in flight), the
    // server owns the field: mirror incoming `value`, never autosave — so a stale
    // blur-flush can't clobber the reducer's text edit.
    frozen: frozenIds.has(block.id),
  });

  const initialConfig = useMemo(
    () => ({
      namespace: `block-text-${block.id}`,
      theme: {
        paragraph: "m-0",
        // Inline mark classes — applied by Lexical to formatted TextNodes. These
        // are plain class strings passed to the framework (not JSX className), so
        // they map marks → utilities directly.
        text: {
          bold: "font-bold",
          italic: "italic",
          underline: "underline",
          strikethrough: "line-through",
          code: "rounded-md bg-muted px-1 font-mono text-[0.9em]",
        },
        link: "text-primary underline",
      },
      // Custom inline nodes (e.g. inline page links) contributed via
      // registerBlockTextExtension, plus LinkNode for inline links. Registered
      // at app bootstrap, so present before any block editor mounts.
      nodes: [LinkNode, ...blockTextNodes()],
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
      focusOffset: (n) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtOffset(ed, n);
      },
    });
  }, [block.id, registerFocusHandle]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("relative flex gap-xs", inset && "pl-md")}>
        {/* Leading-marker gutter: a fixed-width column shared by every marker
            type so the text content edge is identical across block types.
            `justify-center` + `min-width` centers narrow glyphs (bullet,
            number, checkbox) and lets wider markers (the callout icon) grow the
            column without disturbing the others. */}
        {marker != null ? (
          <div
            className="flex flex-none select-none justify-center"
            style={{ minWidth: MARKER_GUTTER }}
          >
            {marker}
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn("outline-none pr-md py-xs", VARIANT_CLASS[textVariant], contentClassName)}
                onFocus={() => {
                  field.onFocus();
                  editor.onFocus();
                }}
                onBlur={field.onBlur}
              />
            }
            placeholder={
              isEmpty && isFocused && placeholder ? (
                <div className={cn("text-muted-foreground pointer-events-none absolute left-0 top-0 pr-md py-xs", VARIANT_CLASS[textVariant])}>
                  {placeholder}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          {/* Wires TOGGLE_LINK_COMMAND → LinkNode; validateUrl gates the href to
              the allowed protocols. ClickableLinkPlugin makes links open in a new
              tab on cmd/ctrl-click (plain click still places the caret), the
              Notion-like editable-link UX. */}
          <LinkPlugin validateUrl={isValidLinkUrl} />
          <ClickableLinkPlugin newTab />
          <ValueSyncPlugin value={field.value} onChange={field.onChange} />
          <KeyboardPlugin blockId={block.id} editor={editor} />
          <SlashMenuPlugin editor={editor} />
          <MarkdownShortcutPlugin block={block} editor={editor} />
          <FormatShortcutsPlugin />
          <FormatToolbarPlugin />
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
