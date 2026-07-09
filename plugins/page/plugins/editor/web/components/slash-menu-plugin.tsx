import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  atWordBoundary,
  CaretTriggerMenu,
  useCaretMenu,
  useCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import type { BlockHandle } from "../../core";
import type { BlockEditorAPI } from "../types";
import {
  BlockTypeList,
  filterBlockTypes,
  useInsertableBlocks,
} from "./block-type-list";

const TRIGGER = "/";

/**
 * Inline, Notion-style slash menu, built on the shared caret-trigger primitive:
 * open-state + query are DERIVED from the live editor text (never a latch — see
 * the primitive's CLAUDE.md). Typing `/` at a word boundary opens it, the text
 * after the `/` filters it, arrows/Enter navigate, Esc / outside-press dismiss.
 *
 * The `/` triggers anywhere mid-line (Notion's model), so `canOpen: atWordBoundary`
 * keeps it from firing on `/` inside URLs (`http://`), dates (`06/15`), paths
 * (`a/b`), or fractions (`1/2`); a `/` followed by a space is a literal slash.
 * Because the trigger is mid-line, the menu is caret-anchored via `CaretTriggerMenu`.
 *
 * On select, the `/query` is stripped and the block is converted in place to the
 * chosen type, keeping the text around the slash.
 */
export function SlashMenuPlugin({ editor }: { editor: BlockEditorAPI }) {
  const [lexicalEditor] = useLexicalComposerContext();
  const insertable = useInsertableBlocks();

  const caret = useCaretQuery({
    id: "slash",
    trigger: TRIGGER,
    canOpen: atWordBoundary,
    // A newline ends the query; any space means the user typed a literal `/ …`
    // (not a command) — Notion dismisses the menu the moment a space follows.
    isQueryValid: (q) => !/[\n ]/.test(q),
  });

  const filtered = filterBlockTypes(insertable, caret.query);

  function handleSelect(handle: BlockHandle<unknown>) {
    // Convert the current block to the chosen type, dropping the `/query`
    // (Notion's model: `/` transforms the current block, keeping the text around
    // the slash). `convertTo` authoritatively rewrites the block's `data` — the
    // same path the markdown shortcuts use — so the field's debounced autosave
    // can't clobber it.
    //
    // Compute `remaining` from a synchronous READ: this runs inside the Enter
    // command (already within a Lexical update), so a nested `lexicalEditor.
    // update()` is DEFERRED — its result isn't observable here. The strip below
    // is purely the live-editor reflection; `convertTo` is what persists.
    let found = false;
    let nodeKey = "";
    let stripIdx = 0;
    let caretIdx = 0;
    let remaining = "";
    lexicalEditor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf(TRIGGER);
      if (idx === -1) return;
      found = true;
      nodeKey = node.getKey();
      stripIdx = idx;
      caretIdx = caretOffset;
      remaining = full.slice(0, idx) + full.slice(caretOffset);
    });
    if (!found) return;

    // Reflect the strip in the live editor (deferred is fine — it's visual only).
    lexicalEditor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      node.setTextContent(full.slice(0, stripIdx) + full.slice(caretIdx));
      node.select(stripIdx, stripIdx);
    });
    editor.convertTo(handle.type, { ...(handle.empty?.() ?? {}), text: remaining });
  }

  const { surfaceOpen, activeIndex, setActiveIndex } = useCaretMenu(caret, {
    itemCount: filtered.length,
    onCommit: (i) => handleSelect(filtered[i]!),
    surfaceWhen: "interactive",
  });

  return (
    <CaretTriggerMenu
      caret={caret}
      open={surfaceOpen}
      width="sm"
      padding="xs"
      maxHeight="lg"
    >
      <BlockTypeList
        blocks={filtered}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onHoverIndex={setActiveIndex}
      />
    </CaretTriggerMenu>
  );
}
