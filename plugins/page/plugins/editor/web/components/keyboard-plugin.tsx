import { useEffect, useRef } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { BlockEditorAPI } from "../types";
import { Editor } from "../slots";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { serializeBlockRuns } from "../internal/block-text-extensions";
import {
  placeCaretAtOffset,
  readCaretContext,
  type CaretContext,
} from "../internal/caret-geometry";
import { $scanMarkSpan, removeMarkSpan } from "../internal/inline-format-surgery";
import { markStep, readMarkDepth, registerMarkDepth } from "../internal/mark-depth";
import { toNodes } from "../internal/optimistic-block-ops";
import {
  resolveKeystroke,
  type KeyIntent,
  type KeystrokeKey,
} from "../internal/keystroke-intent";

/**
 * Translates every caret-affecting keystroke into a structural op or a cross-block
 * caret move. The plugin is intentionally thin: it reads the caret geometry, hands
 * `(key, caret, block context)` to the single `resolveKeystroke` intent step, and
 * executes the returned intent against the block API. All the decisions (split
 * asChild, merge-vs-outdent, indent/outdent guards, when an arrow crosses blocks)
 * live in `resolveKeystroke`, not here.
 */
export function KeyboardPlugin({
  blockId,
  editor,
}: {
  blockId: string;
  editor: BlockEditorAPI;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const { rowsRef, unwrapBlock, makeBlockAPI, recordDocEdit } = useBlockEditor();
  const recordDocEditRef = useLatestRef(recordDocEdit);
  const unwrapRef = useRef(unwrapBlock);
  unwrapRef.current = unwrapBlock;
  const makeBlockAPIRef = useRef(makeBlockAPI);
  makeBlockAPIRef.current = makeBlockAPI;
  // The block-type registry: every block's static handle config (incl. the edit
  // policy and split-into-child flag). Resolved here, not prop-drilled.
  const contributions = Editor.Block.useContributions();
  const contributionsRef = useRef(contributions);
  contributionsRef.current = contributions;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const selection = useSelectionControl();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;

  useEffect(() => {
    function execute(
      intent: KeyIntent,
      event: KeyboardEvent,
      caret: CaretContext,
    ): boolean {
      const api = editorRef.current;
      switch (intent.type) {
        case "passthrough":
          return false;
        case "noop":
          // Ours, but nothing to do — consume the event (e.g. Tab at a boundary
          // must not move focus or insert a tab character).
          event.preventDefault();
          return true;
        case "split": {
          event.preventDefault();
          // Serialize the live runs so the reducer splits the authoritative
          // (possibly not-yet-autosaved) content.
          const runs = serializeBlockRuns(lexicalEditor);
          api.split(intent.position, {
            asChild: intent.asChild,
            childType: intent.childType,
            siblingType: intent.siblingType,
            tailData: intent.tailData,
            runs,
          });
          return true;
        }
        case "convertTo": {
          event.preventDefault();
          // Reset this block to a plain type (children untouched). This ladder
          // rung strips NOTHING — it removes a marker glyph the block never
          // stored as text — so it carries no text at all: the block keeps its
          // id, hence its content doc, and `convertTo` carries the row's `text`
          // projection across on its own. An unregistered `intent.to` seeds an
          // empty payload and the write boundary rejects the unknown type
          // loudly, as before.
          const target = contributionsRef.current.find(
            (c) => c.block.type === intent.to,
          )?.block;
          api.convertTo(intent.to, target?.emptyRowData() ?? {});
          return true;
        }
        case "merge": {
          event.preventDefault();
          const runs = serializeBlockRuns(lexicalEditor);
          api.merge({ runs });
          return true;
        }
        case "mergeNext":
          // Forward-delete: the runs come from the NEXT block (read via its own
          // handle inside `mergeNext`), never this editor — so no serialize here.
          event.preventDefault();
          api.mergeNext();
          return true;
        case "outdent":
          event.preventDefault();
          api.outdent();
          return true;
        case "unwrap":
          // The target is the CONTAINER (an anchor row that holds no caret and
          // has no `BlockEditorAPI` of its own), so this goes through the
          // editor-wide entry point rather than this block's api.
          event.preventDefault();
          unwrapRef.current(intent.blockId);
          return true;
        case "expand":
          // Also the CONTAINER, for the same reason — but `setExpanded` is a
          // per-block API, so address it by minting one for that id. The caret
          // stays exactly where it is: this press spends itself opening the box,
          // and the next one acts on the document now on screen.
          event.preventDefault();
          makeBlockAPIRef.current(intent.blockId).setExpanded(true);
          return true;
        case "markStep":
          // Selection only: the caret must NOT move, so the arrow's default is
          // suppressed and the linear offset is left exactly where it was. No
          // undo capture and no `discrete` — `captureBlockDocEdit` fences
          // CONTENT mutations, and this changes none.
          event.preventDefault();
          markStep(lexicalEditor, intent.marks, intent.escaped);
          return true;
        case "markArrive":
          // The caret moves AND lands on the seam's stop, as one press. We place
          // it rather than letting the browser, because the stop is the state the
          // browser never picks — and because placing through
          // `$placeCaretAtLinearOffset` is what makes the resolver's lookahead
          // exact: it read the boundary off the very anchor this lands on.
          event.preventDefault();
          placeCaretAtOffset(lexicalEditor, intent.offset);
          markStep(lexicalEditor, intent.marks, true);
          return true;
        case "unmark": {
          event.preventDefault();
          // A Lexical command listener runs INSIDE an `editor.update()`, where a
          // nested `discrete: true` update is ENQUEUED rather than committed —
          // so `recordDocEdit`'s capture window would already have closed by the
          // time the edit landed, losing the undo boundary AND double-recording
          // through the mirror. Deferring one microtask is the same contract the
          // inline autoformat and `split` already keep; `removeMarkSpan` throws
          // rather than degrade if it is ever violated.
          //
          // Deferring means the caret may have moved, hence the plan: snapshot
          // the live position now, re-verify it there, and abort changing
          // nothing on drift (which records nothing — a free no-op).
          const plan = lexicalEditor
            .getEditorState()
            .read(() => $scanMarkSpan(intent.delimiter));
          if (plan === null) return true;
          queueMicrotask(() => {
            // Its own undo entry, fenced off the 500ms typing run on both sides:
            // ONE Cmd+Z restores the mark and nothing else.
            recordDocEditRef.current(blockIdRef.current, "Remove formatting", () => {
              removeMarkSpan(lexicalEditor, plan);
            });
          });
          return true;
        }
        case "indent":
          event.preventDefault();
          api.indent();
          return true;
        case "nav":
          event.preventDefault();
          api.navigate(intent.dir, caret);
          return true;
        case "selectBlock":
          if (!selectionRef.current) return false;
          event.preventDefault();
          selectionRef.current.enterSelectionMode(blockIdRef.current, intent.extend);
          return true;
      }
    }

    function handle(key: KeystrokeKey, event: KeyboardEvent | null): boolean {
      if (!event || event.isComposing) return false;
      // The mark-delimiter depth is passed IN rather than read by the geometry
      // module, which keeps that module free of module state; it is verified
      // against the live anchor inside the same read.
      const caret = readCaretContext(lexicalEditor, readMarkDepth(lexicalEditor));
      if (!caret) return false;
      const nodes = toNodes(rowsRef.current);
      // Resolve the current block's declarative edit policy from the registry.
      // `splitChildWhenExpanded` is render-state-dependent (the live `expanded`
      // flag), so it folds into the same policy here rather than being drilled.
      const handleOf = (type: string) =>
        contributionsRef.current.find((c) => c.block.type === type)?.block;
      const node = nodes.find((b) => b.id === blockIdRef.current);
      const handle = handleOf(node?.type ?? "");
      const editPolicy = {
        asChild: handle?.splitChildWhenExpanded && node?.expanded ? true : undefined,
        childType: handle?.splitChildWhenExpanded?.childType,
        splitInto: handle?.splitInto,
        resetToOnBackspaceAtStart: handle?.resetToOnBackspaceAtStart,
        breakOutOnEmptyEnter: handle?.breakOutOnEmptyEnter,
        // The tail's `data` transform (e.g. checked to-do → unchecked tail),
        // bound to its handle so the resolver can invoke it without the handle.
        dataOnSplit: handle?.dataOnSplit?.bind(handle),
      };
      const intent = resolveKeystroke(key, { shift: event.shiftKey }, caret, {
        nodes,
        blockId: blockIdRef.current,
        // Type facts from the same registry, resolved per node (the ladders ask
        // about OTHER blocks — the line above, the line below, the parent — not
        // just this one). An unregistered type is text-less and not an anchor:
        // refusing only demotes a structural keystroke to a caret move, whereas
        // assuming text would hand the write boundary a payload it rejects.
        acceptsText: (n) => handleOf(n.type)?.acceptsText === true,
        isAnchor: (n) => handleOf(n.type)?.anchor === true,
        editPolicy,
      });
      return execute(intent, event, caret);
    }

    const reg = (cmd: LexicalCommand<KeyboardEvent | null>, key: KeystrokeKey) =>
      lexicalEditor.registerCommand(cmd, (e) => handle(key, e), COMMAND_PRIORITY_HIGH);

    const unregister = [
      // The mark-delimiter depth store's own lifecycle: cleared on any update
      // with dirty leaves, re-asserted onto `selection.format` on every
      // selection change while it is valid.
      registerMarkDepth(lexicalEditor),
      reg(KEY_ENTER_COMMAND, "Enter"),
      reg(KEY_BACKSPACE_COMMAND, "Backspace"),
      reg(KEY_DELETE_COMMAND, "Delete"),
      reg(KEY_TAB_COMMAND, "Tab"),
      reg(KEY_ARROW_UP_COMMAND, "ArrowUp"),
      reg(KEY_ARROW_DOWN_COMMAND, "ArrowDown"),
      reg(KEY_ARROW_LEFT_COMMAND, "ArrowLeft"),
      reg(KEY_ARROW_RIGHT_COMMAND, "ArrowRight"),
      // Escape leaves text editing and selects the whole block — not a caret move,
      // so it stays a direct handler rather than flowing through the resolver.
      lexicalEditor.registerCommand<KeyboardEvent | null>(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!selectionRef.current) return false;
          event?.preventDefault();
          selectionRef.current.enterSelectionMode(blockIdRef.current);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    ];

    return () => {
      for (const u of unregister) u();
    };
  }, [lexicalEditor, rowsRef, recordDocEditRef]);

  // Undo/redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y) is NOT handled per-block. With no
  // Lexical `HistoryPlugin`, nothing here consumes those keystrokes, so the native
  // keydown bubbles out to the surface-level `useUndoRedoShortcuts` binding (the
  // tab's, in `apps-core/tab-surface`) — which is tab-scoped and focus-independent,
  // so it fires even after a structural undo leaves DOM focus on <body>.

  return null;
}
