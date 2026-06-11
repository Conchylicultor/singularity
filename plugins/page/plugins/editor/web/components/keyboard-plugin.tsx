import { useEffect, useRef } from "react";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { serializeBlockText } from "../internal/block-text-extensions";
import { readCaretContext, type CaretContext } from "../internal/caret-geometry";
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
  splitOptions,
}: {
  blockId: string;
  editor: BlockEditorAPI;
  splitOptions?: { asChild?: boolean; childType?: string };
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const { rowsRef, pageId } = useBlockEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const splitOptionsRef = useRef(splitOptions);
  splitOptionsRef.current = splitOptions;
  const selection = useSelectionControl();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;

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
          // Serialize the live text so the reducer splits the authoritative
          // (possibly not-yet-autosaved) string.
          const text = serializeBlockText(lexicalEditor);
          api.split(intent.position, {
            asChild: intent.asChild,
            childType: intent.childType,
            text,
          });
          return true;
        }
        case "merge": {
          event.preventDefault();
          const text = serializeBlockText(lexicalEditor);
          api.merge({ text });
          return true;
        }
        case "outdent":
          event.preventDefault();
          api.outdent();
          return true;
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
      const caret = readCaretContext(lexicalEditor);
      if (!caret) return false;
      const intent = resolveKeystroke(key, { shift: event.shiftKey }, caret, {
        nodes: toNodes(rowsRef.current),
        blockId: blockIdRef.current,
        pageId: pageIdRef.current,
        splitOptions: splitOptionsRef.current,
      });
      return execute(intent, event, caret);
    }

    const reg = (cmd: LexicalCommand<KeyboardEvent | null>, key: KeystrokeKey) =>
      lexicalEditor.registerCommand(cmd, (e) => handle(key, e), COMMAND_PRIORITY_HIGH);

    const unregister = [
      reg(KEY_ENTER_COMMAND, "Enter"),
      reg(KEY_BACKSPACE_COMMAND, "Backspace"),
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
  }, [lexicalEditor, rowsRef]);

  return null;
}
