import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { insetClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LinkNode } from "@lexical/link";
import type { LexicalEditor } from "lexical";
import { runsOf, type Block, type BlockTextVariant, type RichText } from "../../core";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import { CollabTextPlugin } from "./collab-text-plugin";
import { KeyboardPlugin } from "./keyboard-plugin";
import { BlockMenuPlugin } from "./block-menu-plugin";
import { MarkdownShortcutPlugin } from "./markdown-shortcut-plugin";
import { InlineMarkdownPlugin } from "./inline-markdown-plugin";
import { FormatToolbarPlugin } from "./format-toolbar-plugin";
import { FormatShortcutsPlugin } from "./format-shortcuts-plugin";
import { BlockPastePlugin } from "./block-paste-plugin";
import { BlockForestPastePlugin } from "./block-forest-paste-plugin";
import { blockTextNodes, getBlockTextExtensions, serializeBlockRuns } from "../internal/block-text-extensions";
import { isValidLinkUrl } from "../internal/link-url";
import { BLOCK_INSET } from "../internal/page-column";
import {
  placeCaretAtBoundary,
  placeCaretAtColumn,
  placeCaretAtOffset,
} from "../internal/caret-geometry";
import {
  appendRunsAtJoin,
  deleteBlockTextRange,
  focusHydratingAware,
  truncateBlockTextFrom,
} from "../internal/collab-text-surgery";
import "./block-document-scale.css";

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
 * The editable-text LEAF: the entire Lexical pipeline — the per-block CRDT
 * binding, structural keyboard handling, the slash menu, and the markdown
 * block-shortcut affordance — and nothing else.
 *
 * It owns no layout. The line wrapper, the leading-marker gutter and the leaf
 * cell all live in `TextBlockLayout`, which renders this as its `children`, so
 * the element chain above `<LexicalComposer>` is constant across every
 * text-bearing block type (see that file for why). Consequence: the marker
 * gutter now sits OUTSIDE the composer — nothing reads Lexical context from a
 * marker today, and arguably a region should not be able to.
 *
 * Deliberately NOT exported from the web barrel: a block type never renders this
 * itself, it declares `chrome` and lets the shared renderer place it.
 */
export function BlockTextEditor({
  block,
  isFocused,
  editor,
  placeholder,
  contentClassName,
  textVariant,
}: {
  block: Block;
  isFocused: boolean;
  editor: BlockEditorAPI;
  /** Shown when the block is empty and focused. */
  placeholder?: ReactNode;
  /** Extra classes for the editable content (e.g. strikethrough when done). */
  contentClassName?: string;
  /** Semantic typography variant for the editable text and placeholder. */
  textVariant: BlockTextVariant;
}) {
  const runs = runsOf((block.data as Record<string, unknown> | null)?.text);
  const isEmpty = runs.length === 0;
  const { registerFocusHandle, blockMenuDraftId } = useBlockEditor();
  // While the gutter-`+` draft menu is open on this block, the block's own text
  // is the menu's inline filter — so the placeholder invites that.
  const effectivePlaceholder = blockMenuDraftId === block.id ? "Type to filter" : placeholder;
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);

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
      // Skip Lexical's default empty-paragraph bootstrap — content arrives
      // exclusively via the collab sync (the pre-seeded per-block doc), and a
      // locally-bootstrapped paragraph would be a divergent local edit.
      editorState: null,
    }),
    [block.id],
  );

  useEffect(() => {
    return registerFocusHandle(block.id, {
      focus: (opts) => {
        const ed = lexicalEditorRef.current;
        if (!ed) return;
        // The content doc syncs async after mount, and Lexical's focus() is a
        // no-op on a still-empty root — use the hydration-aware focus (DOM
        // focus now, caret to content start on first sync). `opts.scroll`
        // (default false) declares whether the landing follows the caret.
        focusHydratingAware(ed, opts?.scroll ?? false);
      },
      focusAtColumn: (x, edge, opts) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtColumn(ed, x, edge, opts?.scroll ?? false);
      },
      focusBoundary: (edge, opts) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtBoundary(ed, edge, opts?.scroll ?? false);
      },
      focusOffset: (n, opts) => {
        const ed = lexicalEditorRef.current;
        if (ed) placeCaretAtOffset(ed, n, opts?.scroll ?? false);
      },
      // Content surgery: split/merge drive the LIVE content through Lexical so
      // the collab binding syncs the change into the block's content doc
      // (marks + decorator tokens preserved, like any local edit).
      truncateAt: (offset: number) => {
        const ed = lexicalEditorRef.current;
        if (ed) truncateBlockTextFrom(ed, offset);
      },
      appendRunsAtEnd: (runs: RichText) => {
        const ed = lexicalEditorRef.current;
        if (ed) appendRunsAtJoin(ed, runs);
      },
      deleteRange: (from: number, to: number) => {
        const ed = lexicalEditorRef.current;
        if (ed) deleteBlockTextRange(ed, from, to);
      },
      // The read dual of `appendRunsAtEnd`: serialize this block's LIVE runs (the
      // same call the keyboard plugin makes for split/convertTo/merge), so a
      // forward-delete in the PREVIOUS block can pull this block's freshly-typed
      // content up without waiting on the ~1s `data.text` projection.
      readRuns: () => {
        const ed = lexicalEditorRef.current;
        return ed ? serializeBlockRuns(ed) : [];
      },
    });
  }, [block.id, registerFocusHandle]);

  return (
    // `LexicalComposer` emits no DOM, so these all render directly inside
    // `TextBlockLayout`'s `relative` leaf cell — which is what the placeholder's
    // `absolute left-0 top-0` resolves against.
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={cn("outline-none py-xs", insetClass({ r: BLOCK_INSET }), VARIANT_CLASS[textVariant], contentClassName)}
            onFocus={() => editor.onFocus()}
          />
        }
        placeholder={
          isEmpty && isFocused && effectivePlaceholder ? (
            <div className={cn("text-muted-foreground pointer-events-none absolute left-0 top-0 py-xs", insetClass({ r: BLOCK_INSET }), VARIANT_CLASS[textVariant])}>
              {effectivePlaceholder}
            </div>
          ) : null
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      {/* Wires TOGGLE_LINK_COMMAND → LinkNode; validateUrl gates the href to
          the allowed protocols. ClickableLinkPlugin makes links open in a new
          tab on cmd/ctrl-click (plain click still places the caret), the
          Notion-like editable-link UX. */}
      <LinkPlugin validateUrl={isValidLinkUrl} />
      <ClickableLinkPlugin newTab />
      {/* Per-block CRDT binding: content syncs through the block's Y.Doc,
          split/merge are content-doc-aware, and text edits ride the
          unified undo stack via the seam's Y.UndoManager. */}
      <CollabTextPlugin block={block} />
      <KeyboardPlugin blockId={block.id} editor={editor} />
      <BlockMenuPlugin blockId={block.id} />
      <MarkdownShortcutPlugin block={block} />
      {/* Block-level markdown PREFIXES first, then inline delimiters. The order
          is the layering: the inline transform can leave a prefix behind
          (`~~- foo~~` → `- foo`), and the block plugin tag-guards that away, so
          the block listener must already be registered when the inline one
          starts stamping INLINE_FORMAT_TAG. */}
      <InlineMarkdownPlugin blockId={block.id} />
      <FormatShortcutsPlugin />
      <FormatToolbarPlugin />
      <BlockPastePlugin block={block} editor={editor} />
      <BlockForestPastePlugin block={block} editor={editor} />
      {getBlockTextExtensions().map((ext) =>
        ext.Plugin ? (
          <ext.Plugin key={ext.id} block={block} editor={editor} />
        ) : null,
      )}
      <EditorRefPlugin editorRef={lexicalEditorRef} />
    </LexicalComposer>
  );
}
