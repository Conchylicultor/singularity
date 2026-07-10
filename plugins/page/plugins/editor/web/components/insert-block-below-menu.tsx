import { useMemo, useState, type ReactElement } from "react";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import { useBlockEditor } from "../block-editor-context";
import { defaultTextHandle } from "../markdown-blocks";
import { Editor } from "../slots";
import type { BlockEditorAPI } from "../types";
import { useInsertableBlocks } from "./block-type-list";
import { BlockTypePicker } from "./block-type-picker";

/**
 * The gutter `+`, Notion's model: clicking it **creates an empty paragraph below
 * right away** and opens the block-type filter over it. The block is the
 * outcome; the menu only decides its type.
 *
 * So the flow is create-THEN-convert, not pick-then-create:
 *
 * - **Commit** (Enter / click a type) converts the draft block to that type.
 *   Picking the plain-text type is a no-op — it is already that type.
 * - **Cancel** (Esc / outside press / re-click) keeps the draft block and puts
 *   the caret in it, so `+` then Esc is just "new empty line below", never a
 *   dead click.
 *
 * Either way focus lands in the new block, which is why the insert deliberately
 * does NOT focus it (`focus: false`): the filter field owns focus while the menu
 * is open, and the block claims it on close.
 *
 * `draftId` doubles as the open-state — the menu is open exactly when a draft
 * block exists, so the two can never disagree (no orphan draft, no menu over a
 * block that was never created).
 */
export function InsertBlockBelowMenu({
  api,
  trigger,
  align = "start",
  side = "bottom",
  width = "sm",
  padding = "xs",
}: {
  /** API of the block the `+` hangs off — the draft lands immediately after it. */
  api: BlockEditorAPI;
  trigger: ReactElement;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
  width?: InlinePopoverProps["width"];
  padding?: InlinePopoverProps["padding"];
}) {
  const { makeBlockAPI, focusBlock } = useBlockEditor();
  const contributions = Editor.Block.useContributions();
  const insertable = useInsertableBlocks();
  const [draftId, setDraftId] = useState<string | null>(null);

  // The paragraph type the draft is born as, declared by the block type itself
  // (`defaultText`) rather than named here — the editor core never hardcodes a
  // block type. Absent it, there is nothing to create and no affordance to show.
  const paragraph = useMemo(
    () => defaultTextHandle(contributions.map((c) => c.block)),
    [contributions],
  );

  if (!paragraph || insertable.length === 0) return null;

  // Hand focus back to the draft after the surface closes: base-ui restores
  // focus to the trigger as it unmounts the popup, so claim it afterwards. A
  // just-converted block may also be re-rendering into a different renderer.
  const close = (focusId: string | null) => {
    setDraftId(null);
    if (focusId) queueMicrotask(() => focusBlock(focusId));
  };

  return (
    <InlinePopover
      open={draftId !== null}
      onOpenChange={(next) => {
        if (next) {
          setDraftId(api.insertAfter(paragraph.type, paragraph.empty?.() ?? {}, { focus: false }));
        } else close(draftId);
      }}
      align={align}
      side={side}
      width={width}
      padding={padding}
      trigger={trigger}
    >
      <BlockTypePicker
        onSelect={(block) => {
          if (draftId && block.type !== paragraph.type) {
            makeBlockAPI(draftId).convertTo(block.type, block.empty?.() ?? {});
          }
          close(draftId);
        }}
        onDismiss={() => close(draftId)}
      />
    </InlinePopover>
  );
}
