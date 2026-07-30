import { useMemo } from "react";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  atWordBoundary,
  CaretTriggerMenu,
  useCaretMenu,
  useCaretQuery,
  useForcedCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import type { BlockHandle } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { $linearCaretOffset } from "../internal/block-text-extensions";
import {
  BlockTypeList,
  filterBlockTypes,
  flattenSections,
  useGroupedInsertableBlocks,
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
 * before the caret (it was pure filter, not content). Both go through the ONE
 * `convertStrippingText` primitive — the strip is a CONTENT-DOC edit (text has a
 * single owner), never a row payload the type write carries.
 */
export function BlockMenuPlugin({ blockId }: { blockId: string }) {
  const [lexicalEditor] = useLexicalComposerContext();
  const grouped = useGroupedInsertableBlocks();
  const flatAll = useMemo(() => flattenSections(grouped), [grouped]);
  const { blockMenuDraftId, clearBlockMenu, convertStrippingText } = useBlockEditor();
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
  // While filtering, collapse to a single flat label-less section (headers make
  // no sense over a relevance-ranked result); with no query, show the grouped
  // sections. `flat` is the keyboard nav index space (over selectable rows only),
  // matching what `BlockTypeList` renders.
  const sections = useMemo(
    () => (menu.query ? [{ blocks: filterBlockTypes(flatAll, menu.query) }] : grouped),
    [menu.query, flatAll, grouped],
  );
  const flat = useMemo(() => flattenSections(sections), [sections]);

  function handleSelect(handle: BlockHandle<unknown>) {
    // Resolve the consumed span as LINEAR offsets — the stored-runs plain-text
    // basis the whole content-surgery seam speaks (same as split `position`).
    //   - slash: `[the `/`, the caret)`, so the text AROUND the slash survives.
    //   - draft: `[block start, the caret)` — every character before the caret
    //     was filter text the user never meant as content.
    // Read the committed state: this runs inside the caret menu's own
    // `editor.update()` (both the Enter command and the pointer commit), where
    // nothing has been mutated yet.
    let found = false;
    let from = 0;
    let to = 0;
    lexicalEditor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const caret = $linearCaretOffset();
      if (caret === null) return;
      if (useForced) {
        // An empty draft block has no text node at all — `from === to === 0`
        // strips nothing and the conversion proceeds, which is the point.
        found = true;
        to = caret;
        return;
      }
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const idx = node.getTextContent().slice(0, sel.anchor.offset).lastIndexOf(TRIGGER);
      if (idx === -1) return;
      found = true;
      // Within ONE text node linear offsets advance 1:1 with node offsets, so
      // the node-relative distance back to the `/` is also the linear distance.
      from = caret - (sel.anchor.offset - idx);
      to = caret;
    });
    if (!found) return;

    convertStrippingText({
      blockId,
      from,
      to,
      type: handle.type,
      // The block keeps its id, so it keeps its content doc: seed only the
      // target type's NON-text defaults and let its text come along untouched.
      data: handle.emptyRowData(),
    });
    if (useForced) clearBlockMenu(blockId);
  }

  const { surfaceOpen, activeIndex, setActiveIndex, commit } = useCaretMenu(menu, {
    itemCount: flat.length,
    onCommit: (i) => handleSelect(flat[i]!),
    surfaceWhen: "interactive",
  });

  // Both keyboard (Enter) and mouse commit through the SAME `onCommit` — the
  // menu's `commit` runs it on pointerdown and inside an `editor.update()`, so a
  // click and Enter are the same operation (see `useCaretMenu`).
  return (
    <CaretTriggerMenu caret={menu} open={surfaceOpen} width="sm" padding="xs" maxHeight="lg">
      <BlockTypeList
        sections={sections}
        activeIndex={activeIndex}
        onCommit={commit}
        onHoverIndex={setActiveIndex}
      />
    </CaretTriggerMenu>
  );
}
