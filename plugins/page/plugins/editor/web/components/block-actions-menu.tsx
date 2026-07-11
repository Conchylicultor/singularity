import { useMemo, useState, type ReactElement } from "react";
import { MdDelete } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import { PAGE_BLOCK_TYPE, type Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { Editor } from "../slots";
import { useBlockEditor } from "../block-editor-context";
import { useInsertableBlocks, BlockTypeList } from "./block-type-list";

/**
 * Per-block actions popover, opened from the gutter drag handle. A single
 * popover (no nested submenus): a "Turn into" section listing insertable block
 * types (→ `api.convertTo`) plus any `Editor.TurnInto` contributions, and a
 * "Delete" item (→ `api.remove`). Sub-page rows get only "Delete" — see
 * `convertible` below.
 */
export function BlockActionsMenu({
  trigger,
  block,
  api,
  align = "start",
  side = "bottom",
}: {
  trigger: ReactElement;
  block: Block;
  api: BlockEditorAPI;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blocks = useInsertableBlocks();
  // Turn-into stays flat: it keeps its own "Turn into" eyebrow (below), so it
  // passes one label-less section and ignores the config's group boundaries
  // while still inheriting the flattened config order.
  const sections = useMemo(() => [{ blocks }], [blocks]);
  const { serverSync } = useBlockEditor();

  // A page row is not convertible. Converting it away from `page` would orphan
  // every row keyed `page_id = <this block's id>` — that subtree lives in
  // another partition and no query would ever reach it again. (The server
  // rejects the transition too; this hides the affordance that produces it.)
  const convertible = block.type !== PAGE_BLOCK_TYPE;

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveIndex(-1);
      }}
      align={align}
      side={side}
      width="sm"
      padding="xs"
      trigger={trigger}
    >
      <Stack gap="xs">
        {convertible ? (
          <>
            <Text
              as="div"
              variant="caption"
              className="text-muted-foreground px-sm pt-xs font-medium uppercase tracking-wide"
            >
              Turn into
            </Text>
            <BlockTypeList
              sections={sections}
              activeIndex={activeIndex}
              onHoverIndex={setActiveIndex}
              onSelect={(handle) => {
                api.convertTo(handle.type, handle.empty?.() ?? {});
                setOpen(false);
              }}
            />
            {/* A `TurnInto` contribution converts a block into something the
                editor's own pure `convertTo` cannot express — a server-backed
                transition (today: into a sub-page, re-partitioning `page_id`
                across a page boundary). None of that exists without rows, so the
                whole zone is gated on `serverSync` rather than per-contributor. */}
            {serverSync ? (
              <Editor.TurnInto.Render>
                {(a) => <a.component block={block} api={api} close={() => setOpen(false)} />}
              </Editor.TurnInto.Render>
            ) : null}
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- my-0.5 is a hairline separator's own inset between the menu's two zones; not a Stack-gap rhythm (the surrounding gap-xs is intentionally tighter) */}
            <div className="bg-border my-0.5 h-px" />
          </>
        ) : null}
        <Row
          className="text-destructive"
          icon={<MdDelete />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            api.remove();
            setOpen(false);
          }}
        >
          Delete
        </Row>
      </Stack>
    </InlinePopover>
  );
}
