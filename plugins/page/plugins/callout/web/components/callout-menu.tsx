import type { Block } from "@plugins/page/plugins/editor/core";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import { CalloutAppearanceFor } from "./callout-appearance";

/**
 * The callout's sections in the rail's block-actions menu
 * (`BlockFrameMeta.menu`), rendered above the generic structural actions
 * (Collapse / Remove callout / Delete) that menu supplies for every container.
 *
 * These are the SAME controls the glyph's popover offers, on purpose: the rail
 * is where a user looks for a block's actions, the glyph is where they look for
 * the glyph. They are not wired twice — both render `CalloutAppearanceFor`, the
 * one binding of `data → controls → api.update`.
 *
 * The container half of the menu is contributed by nobody: Collapse, Remove and
 * Delete are generic over `BlockHandle.anchor`, and "Remove callout" derives its
 * wording from this type's own `label`. So a container with no per-instance
 * appearance (the context card) contributes no menu at all and still gets them.
 */
export function CalloutMenu({
  block,
  api,
  close,
}: {
  block: Block;
  api: BlockEditorAPI;
  close: () => void;
}) {
  return <CalloutAppearanceFor data={block.data} api={api} close={close} />;
}
