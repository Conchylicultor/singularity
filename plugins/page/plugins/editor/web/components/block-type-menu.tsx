import { useMemo, useState, type ReactElement } from "react";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { BlockHandle } from "../../core";
import { useInsertableBlocks, filterBlockTypes, BlockTypeList } from "./block-type-list";

/**
 * Uncontrolled popover that lets the user pick an insertable block type. Wraps
 * an `InlinePopover` trigger over a `SearchInput` + `BlockTypeList`, with
 * Arrow/Enter/Escape keyboard nav driven from the search field. Used by the
 * gutter `+` button and the bottom Add-block menu.
 */
export function BlockTypeMenu({
  trigger,
  onSelect,
  align = "start",
  side = "bottom",
  contentClassName = "w-56 p-xs",
}: {
  trigger: ReactElement;
  onSelect: (block: BlockHandle<unknown>) => void;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const blocks = useInsertableBlocks();

  const filtered = useMemo(
    () => filterBlockTypes(blocks, query),
    [blocks, query],
  );

  if (blocks.length === 0) return null;

  const choose = (block: BlockHandle<unknown>) => {
    onSelect(block);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
      align={align}
      side={side}
      contentClassName={contentClassName}
      trigger={trigger}
    >
      <Stack gap="xs">
        <SearchInput
          autoFocus
          placeholder="Filter blocks..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const block = filtered[activeIndex];
              if (block) choose(block);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              setQuery("");
              setActiveIndex(0);
            }
          }}
        />
        <BlockTypeList
          blocks={filtered}
          activeIndex={activeIndex}
          onSelect={choose}
          onHoverIndex={setActiveIndex}
        />
      </Stack>
    </InlinePopover>
  );
}
