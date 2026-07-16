import { useCallback, useMemo } from "react";
import { useBlockEditor } from "../block-editor-context";
import { defaultTextHandle } from "../../core";
import { Editor } from "../slots";
import type { BlockEditorAPI } from "../types";

/**
 * The gutter `+` action (Notion's model): insert an empty paragraph immediately
 * below the block the `+` hangs off, FOCUS it, and flag it as the draft so its
 * own `BlockMenuPlugin` force-opens the shared caret menu — inline-filtered by
 * the block's own text. Unlike the old popover flow (a separate `SearchInput`
 * held focus), the NEW block owns focus so its text is the filter.
 *
 * The paragraph type is declared by the block type itself (`defaultText`,
 * resolved via `defaultTextHandle`) — the editor core never names a block type.
 */
export function useInsertBlockBelow() {
  const { requestBlockMenu } = useBlockEditor();
  const contributions = Editor.Block.useContributions();
  const paragraph = useMemo(
    () => defaultTextHandle(contributions.map((c) => c.block)),
    [contributions],
  );
  return useCallback(
    (api: BlockEditorAPI) => {
      if (!paragraph) return;
      // focus:true — the NEW block owns focus so its own text is the inline
      // filter (unlike the old popover flow, where a separate SearchInput held
      // focus).
      const newId = api.insertAfter(paragraph.type, paragraph.empty?.() ?? {}, { focus: true });
      requestBlockMenu(newId);
    },
    [paragraph, requestBlockMenu],
  );
}
