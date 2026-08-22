import { useCallback, useMemo } from "react";
import { useBlockEditor } from "../block-editor-context";
import { defaultTextHandle, type BlockHandle } from "../../core";
import { Editor } from "../slots";
import type { BlockEditorAPI } from "../types";

/**
 * THE plain-paragraph type, resolved from the registry's own `defaultText` flag.
 *
 * The one derivation, shared by everything below, so the editor keeps naming no
 * block type: it cannot import `page/text` (that would be an editor↔text cycle),
 * and every void block that wanted "Enter starts a line below" used to construct
 * the seed itself from `textBlock.schema` — which is the same fact spelled once
 * per block instead of once.
 */
function useDefaultParagraph(): BlockHandle<unknown> | undefined {
  const contributions = Editor.Block.useContributions();
  return useMemo(
    () => defaultTextHandle(contributions.map((c) => c.block)),
    [contributions],
  );
}

/**
 * The gutter `+` action (Notion's model): insert an empty paragraph immediately
 * below the block the `+` hangs off, FOCUS it, and flag it as the draft so its
 * own `BlockMenuPlugin` force-opens the shared caret menu — inline-filtered by
 * the block's own text. Unlike the old popover flow (a separate `SearchInput`
 * held focus), the NEW block owns focus so its text is the filter.
 */
export function useInsertBlockBelow() {
  const { requestBlockMenu } = useBlockEditor();
  const paragraph = useDefaultParagraph();
  return useCallback(
    (api: BlockEditorAPI) => {
      if (!paragraph) return;
      // focus:true — the NEW block owns focus so its own text is the inline
      // filter (unlike the old popover flow, where a separate SearchInput held
      // focus).
      const newId = api.insertAfter(paragraph.type, paragraph.empty?.() ?? {}, {
        focus: true,
      });
      requestBlockMenu(newId);
    },
    [paragraph, requestBlockMenu],
  );
}

/**
 * "Keep typing on the next line" — insert an empty paragraph below and put the
 * caret in it, with no block menu.
 *
 * The Enter meaning of every void block that has nothing of its own to do with
 * the key (a divider, an equation's committed source, a filled media object).
 * Its twin above opens the menu because the `+` gesture is *"what do I put
 * here?"*; this one is *"I'm done with that block"*, and forcing a menu open
 * would be an answer to a question the user did not ask.
 */
export function useInsertParagraphBelow() {
  const paragraph = useDefaultParagraph();
  return useCallback(
    (api: BlockEditorAPI) => {
      if (!paragraph) return;
      api.insertAfter(paragraph.type, paragraph.empty?.() ?? {}, {
        focus: true,
      });
    },
    [paragraph],
  );
}
