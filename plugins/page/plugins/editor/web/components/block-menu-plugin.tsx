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
  useForcedCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import type { BlockHandle } from "../../core";
import type { BlockEditorAPI } from "../types";
import { useBlockEditor } from "../block-editor-context";
import {
  BlockTypeList,
  filterBlockTypes,
  useInsertableBlocks,
} from "./block-type-list";

const TRIGGER = "/";

/**
 * Unified, Notion-style block menu built on the shared caret-trigger primitive.
 * It opens EITHER of two ways, sharing ONE caret-anchored surface + one keyboard
 * model:
 *
 * - **`/` trigger** — typing `/` at a word boundary opens it; the text after the
 *   `/` filters it (`useCaretQuery`). `canOpen: atWordBoundary` keeps it from
 *   firing on `/` inside URLs (`http://`), dates (`06/15`), paths, or fractions;
 *   a `/` followed by a space is a literal slash.
 * - **Gutter `+` draft** — the gutter `+` inserts an empty paragraph below,
 *   focuses it, and flags it as the draft (`blockMenuDraftId`). This block's
 *   `useForcedCaretQuery` force-opens the same surface, filtered by the block's
 *   OWN text before the caret. Esc / outside-press clears the draft (keeping the
 *   block); the placeholder reads "Type to filter" while it is open.
 *
 * On commit the query span is stripped and the block is converted in place: the
 * `/` flow keeps the text around the slash; the draft flow drops the whole text
 * before the caret (it was pure filter, not content).
 */
export function BlockMenuPlugin({
  editor,
  blockId,
}: {
  editor: BlockEditorAPI;
  blockId: string;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const insertable = useInsertableBlocks();
  const { blockMenuDraftId, clearBlockMenu } = useBlockEditor();
  const active = blockMenuDraftId === blockId;
  // A newline ends the query; any space means the user typed a literal `/ …`
  // (not a command) — Notion dismisses the menu the moment a space follows.
  const isQueryValid = (q: string) => !/[\n ]/.test(q);

  const caret = useCaretQuery({ id: "slash", trigger: TRIGGER, canOpen: atWordBoundary, isQueryValid });
  const forced = useForcedCaretQuery({
    id: "block-draft",
    active,
    isQueryValid,
    onDismiss: () => clearBlockMenu(blockId),
  });

  const useForced = active;
  const menu = useForced ? forced : caret;
  const filtered = filterBlockTypes(insertable, menu.query);

  function handleSelect(handle: BlockHandle<unknown>) {
    // Convert the current block to the chosen type, stripping the query span.
    // slash: drop the `/query` (keep the text around the slash). draft: drop the
    // WHOLE text before the caret (it was pure filter, not content). `convertTo`
    // authoritatively rewrites the block's `data` — the same path the markdown
    // shortcuts use — so the field's debounced autosave can't clobber it.
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
      if (!$isTextNode(node)) {
        // Empty draft block (no text node): nothing to strip; convert as-is.
        if (useForced) {
          found = true;
          remaining = "";
        }
        return;
      }
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = useForced ? 0 : full.slice(0, caretOffset).lastIndexOf(TRIGGER);
      if (!useForced && idx === -1) return;
      found = true;
      nodeKey = node.getKey();
      stripIdx = idx;
      caretIdx = caretOffset;
      remaining = full.slice(0, idx) + full.slice(caretOffset);
    });
    if (!found) return;

    if (nodeKey) {
      // Reflect the strip in the live editor (deferred is fine — it's visual only).
      lexicalEditor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isTextNode(node)) return;
        const full = node.getTextContent();
        node.setTextContent(full.slice(0, stripIdx) + full.slice(caretIdx));
        node.select(stripIdx, stripIdx);
      });
    }
    editor.convertTo(handle.type, { ...(handle.empty?.() ?? {}), text: remaining });
    if (useForced) clearBlockMenu(blockId);
  }

  const { surfaceOpen, activeIndex, setActiveIndex } = useCaretMenu(menu, {
    itemCount: filtered.length,
    onCommit: (i) => handleSelect(filtered[i]!),
    surfaceWhen: "interactive",
  });

  return (
    <CaretTriggerMenu caret={menu} open={surfaceOpen} width="sm" padding="xs" maxHeight="lg">
      <BlockTypeList
        blocks={filtered}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onHoverIndex={setActiveIndex}
      />
    </CaretTriggerMenu>
  );
}
