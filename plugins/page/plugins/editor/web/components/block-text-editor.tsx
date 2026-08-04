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
import { DecoratorNavPlugin } from "@plugins/primitives/plugins/text-editor/plugins/decorator-nav/web";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";
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
import type { FlightInput } from "../internal/caret-authority";
import type { KeystrokeKey } from "../internal/keystroke-intent";
import { TEXT_VARIANT_CLASS } from "./text-variant-class";

/**
 * The Lexical command each buffered {@link KeystrokeKey} replays through, so a
 * keystroke the caret authority held while this editor was mounting resolves
 * through the SAME `resolveKeystroke` step a real one does — including a
 * replayed Enter re-entering `split()`, which claims the next flight.
 * `satisfies` makes a drift from `KeystrokeKey` a tsc error.
 */
const REPLAY_COMMANDS = {
  Enter: KEY_ENTER_COMMAND,
  Backspace: KEY_BACKSPACE_COMMAND,
  Delete: KEY_DELETE_COMMAND,
  Tab: KEY_TAB_COMMAND,
  ArrowUp: KEY_ARROW_UP_COMMAND,
  ArrowDown: KEY_ARROW_DOWN_COMMAND,
  ArrowLeft: KEY_ARROW_LEFT_COMMAND,
  ArrowRight: KEY_ARROW_RIGHT_COMMAND,
} satisfies Record<KeystrokeKey, LexicalCommand<KeyboardEvent | null>>;

/**
 * Apply input the caret authority buffered while this editor was still mounting.
 *
 * ONE CHARACTER PER COMMIT, deliberately — do NOT coalesce a text run into a
 * single `insertText`. Every incremental transform in the editor keys on the
 * text CHANGING one character at a time: the block markdown shortcut fires on
 * the `"- "` → `"- x"` transition, and the inline one is stricter still
 * (exactly-one-char-typed, its defence against re-formatting on Backspace). A
 * coalesced insert never presents those intermediate states, so replaying
 * `"- Bravo bullet"` in one go left the block a plain paragraph and the Enter
 * after it inherited `text` instead of `bulleted-list`. Coalescing was an
 * optimization against a cost that does not exist: the block's `Y.UndoManager`
 * folds a typing run into ONE item via its 500ms `captureTimeout`, exactly as it
 * does for a real burst.
 *
 * A key replays as its Lexical command carrying a SYNTHETIC `KeyboardEvent`:
 * `KeyboardPlugin.handle` takes `KeyboardEvent | null` and only needs a real
 * object to read `key`/`shiftKey` off (its `preventDefault()` on an untrusted
 * event is a harmless no-op), so nothing about the intent resolution knows it
 * was replayed.
 */
function replayBufferedInput(editor: LexicalEditor, entries: readonly FlightInput[]): void {
  for (const entry of entries) {
    if (entry.kind === "text") {
      editor.update(
        () => {
          const selection = $getSelection();
          // The authority only replays into a caret-READY editor, so a range
          // selection is the expected state. Anything else is still recoverable —
          // land at the content end rather than dropping what the user typed,
          // which is the one outcome this whole mechanism exists to prevent.
          if ($isRangeSelection(selection)) selection.insertText(entry.text);
          else $getRoot().selectEnd().insertText(entry.text);
        },
        // `discrete` is LOAD-BEARING, for the same reason `truncateBlockTextFrom`
        // and `appendRunsAtJoin` pass it. Lexical's default commit is a MICROTASK,
        // so without it the next entry resolves against the PRE-insert state:
        // `readCaretContext` reports offset 0 and `serializeBlockRuns` empty runs,
        // `resolveKeystroke` sees an empty block, and a following Enter splits at
        // `position: 0, runs: []` — whose `truncateAt(0)` wipes the content doc.
        // "alpha⏎bravo⏎charlie" came out as ["alpha","","charlie"]. It is equally
        // what makes each character visible to the incremental transforms above.
        { discrete: true },
      );
      continue;
    }
    const consumed = editor.dispatchCommand(
      REPLAY_COMMANDS[entry.key],
      new KeyboardEvent("keydown", { key: entry.key, shiftKey: entry.shift }),
    );
    if (!consumed) applyDefaultAction(editor, entry);
  }
}

/**
 * Perform what the BROWSER would have done for a key no command listener
 * consumed.
 *
 * A live keystroke has two halves: the command dispatch, and — if nobody
 * returned true — the browser's default action. A replay only has the first,
 * because `dispatchCommand` is not a DOM event and a synthetic `KeyboardEvent`
 * is untrusted, so it has no default action to run. Most keys never reach here
 * (Lexical's own rich-text listeners consume Enter, Shift+Enter, Backspace and
 * Delete; `resolveKeystroke` consumes Tab), but ORDINARY CARET MOVEMENT is left
 * to the browser: `KEY_ARROW_LEFT_COMMAND` returns false for a caret that isn't
 * at a block edge, and the replay used to drop it on the floor. Five buffered
 * ArrowLefts silently did nothing, so the Enter after them split at the END of
 * the block instead of mid-word — `["splitXtail", "typed-immediately-"]` where
 * the user typed their way to `["split", "typed-immediately-Xtail"]`.
 *
 * `selection.modify` is the model-level equal of a horizontal caret move, so
 * Left/Right (and their shift-extend forms) replay exactly.
 *
 * KNOWN BOUND — an unconsumed ArrowUp/ArrowDown is NOT reproduced. Unconsumed
 * means the caret is not on the block's first/last visual line (a boundary press
 * resolves to a cross-block `nav`, which IS consumed), i.e. it is a move between
 * VISUAL lines inside one wrapped block — and visual lines exist only in layout,
 * with no model-level equivalent to `modify`. Rather than approximate it with a
 * line-boundary jump that lands somewhere the user did not ask for, the move is
 * dropped: it costs a caret position in a rare case, never content.
 */
function applyDefaultAction(editor: LexicalEditor, entry: FlightInput): void {
  if (entry.kind !== "key") return;
  if (entry.key !== "ArrowLeft" && entry.key !== "ArrowRight") return;
  const isBackward = entry.key === "ArrowLeft";
  editor.update(
    () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      selection.modify(entry.shift ? "extend" : "move", isBackward, "character");
    },
    // Same reason as the text flush: the NEXT replayed key resolves against the
    // committed state, so this move must be committed before it runs.
    { discrete: true },
  );
}

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
        // (default false) declares whether the landing follows the caret;
        // `opts.onLanded` is how the caret authority learns the caret is really
        // HERE (not merely mounted) and can flush what it buffered meanwhile;
        // `opts.onLandingLost` is its failure dual, for the hydrating landing
        // that has to be abandoned because focus moved away meanwhile.
        focusHydratingAware(ed, opts?.scroll ?? false, opts);
      },
      // The three precise placements are synchronous by construction (they land
      // the caret against content that is already there), so they report the
      // landing as soon as they return.
      focusAtColumn: (x, edge, opts) => {
        const ed = lexicalEditorRef.current;
        if (!ed) return;
        placeCaretAtColumn(ed, x, edge, opts?.scroll ?? false);
        opts?.onLanded?.();
      },
      focusBoundary: (edge, opts) => {
        const ed = lexicalEditorRef.current;
        if (!ed) return;
        placeCaretAtBoundary(ed, edge, opts?.scroll ?? false);
        opts?.onLanded?.();
      },
      focusOffset: (n, opts) => {
        const ed = lexicalEditorRef.current;
        if (!ed) return;
        placeCaretAtOffset(ed, n, opts?.scroll ?? false);
        opts?.onLanded?.();
      },
      // Everything the user typed while this editor was mounting. Registering it
      // is what makes this block a legal flight target at all — a handle without
      // it has nowhere to put buffered keystrokes, and the authority refuses to
      // land there (loudly) rather than dropping them.
      replayInput: (entries) => {
        const ed = lexicalEditorRef.current;
        if (ed) replayBufferedInput(ed, entries);
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
            className={cn("outline-none py-xs", insetClass({ r: BLOCK_INSET }), TEXT_VARIANT_CLASS[textVariant], contentClassName)}
            onFocus={() => editor.onFocus()}
          />
        }
        placeholder={
          isEmpty && isFocused && effectivePlaceholder ? (
            <div className={cn("text-muted-foreground pointer-events-none absolute left-0 top-0 py-xs", insetClass({ r: BLOCK_INSET }), TEXT_VARIANT_CLASS[textVariant])}>
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
      <CollabTextPlugin block={block} textVariant={textVariant} />
      <KeyboardPlugin blockId={block.id} editor={editor} />
      {/* Crossing an inline decorator (a `@date` chip, an inline page link, an
          inline formula) in ONE arrow press. Mounted AFTER KeyboardPlugin so it
          registers second within the same priority bucket: the block-edge
          crossing above gets first refusal, and this only ever fires for a caret
          that has a decorator directly beside it — never at a block boundary,
          where the adjacent-sibling lookup finds nothing. */}
      <DecoratorNavPlugin />
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
